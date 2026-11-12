import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { objects, openBoard, uniqueBoardId, waitForServiceWorker } from "./helpers";

// Local-only mode: the Inbox lives in this browser's IndexedDB. The production build registers the service worker, which
// answers the share sheet's POST to /share-target on the device.

/** Submit a real multipart form to /share-target: a navigation, like the OS share sheet's. */
async function share(page: Page, fields: { title?: string; text?: string; url?: string; pictures?: number }) {
  await page.evaluate(async ({ title, text, url, pictures }) => {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/share-target";
    form.enctype = "multipart/form-data";
    for (const [name, value] of Object.entries({ title, text, url })) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value ?? "";
      form.append(input);
    }
    if (pictures) {
      const dt = new DataTransfer();
      for (let i = 0; i < pictures; i++) {
        const c = new OffscreenCanvas(400, 300);
        const g = c.getContext("2d")!;
        g.fillStyle = `hsl(${i * 90} 60% 50%)`;
        g.fillRect(0, 0, 400, 300);
        dt.items.add(new File([await c.convertToBlob({ type: "image/jpeg" })], `shared-${i + 1}.jpg`, { type: "image/jpeg" }));
      }
      const files = document.createElement("input");
      files.type = "file";
      files.name = "media";
      files.multiple = true;
      files.files = dt.files;
      form.append(files);
    }
    document.body.append(form);
    form.submit();
  }, fields);
}

const serious = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);

test.describe("inbox (local-only)", () => {
  test("a share through the service worker lands in the Inbox, and an item can be placed on a board from the panel", async ({ page, isMobile }) => {
    await page.goto("/");
    await waitForServiceWorker(page);
    await share(page, { title: "Harbour light", url: "https://www.example.com/journal/harbour", pictures: 2 });
    await page.waitForURL(/\/inbox/);
    await expect(page.getByRole("article")).toHaveCount(3);
    await expect(page.getByRole("article", { name: /Harbour light, link/ })).toBeVisible();
    await expect(page.getByText("Added 3 items you shared.")).toBeVisible();
    expect(page.url()).not.toContain("shared=");
    expect(await serious(page)).toEqual([]);

    // The home screen counts them.
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Inbox, 3 waiting" })).toBeVisible();

    // Place from the editor's panel: the button, then the drag.
    await openBoard(page, uniqueBoardId("inbox"));
    await page.getByRole("button", { name: "Inbox", exact: true }).click();
    const panel = page.getByRole("complementary", { name: "Inbox" });
    await expect(panel.getByRole("listitem")).toHaveCount(3);
    await panel.getByRole("button", { name: /^Add .* to board$/ }).first().click();
    await expect(panel.getByRole("listitem")).toHaveCount(2);
    expect((await objects(page)).length).toBe(1);

    // Undo is one step and puts the item back in the list.
    await page.getByRole("status").getByRole("button", { name: "Undo" }).first().click();
    await expect(panel.getByRole("listitem")).toHaveCount(3);
    expect((await objects(page)).length).toBe(0);

    // Dragging an item onto the canvas places it where it was dropped (a mouse gesture: not on the phone project).
    if (!isMobile) {
      await panel.getByRole("listitem").first().dragTo(page.locator("#board-canvas"), { targetPosition: { x: 300, y: 250 } });
      await expect(panel.getByRole("listitem")).toHaveCount(2);
      expect((await objects(page)).map((o) => o.type)).toEqual(["image"]);
    }
  });

  test("Quick capture on a board: shortcut, type, Enter, and the item is in the panel", async ({ page, isMobile }) => {
    test.skip(!!isMobile, "keyboard shortcut");
    await openBoard(page, uniqueBoardId("inbox"));
    await page.keyboard.press("Control+Shift+KeyI");
    const dialog = page.getByRole("dialog", { name: "Quick capture" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Link or note")).toBeFocused();
    await dialog.getByLabel("Link or note").fill("Ochre against slate, for the lobby");
    await dialog.getByLabel("Link or note").press("Enter");
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: "Inbox", exact: true }).click();
    await expect(page.getByRole("complementary", { name: "Inbox" }).getByText("Ochre against slate, for the lobby")).toBeVisible();
  });

  test("the Inbox page: capture a link, select and delete, with a confirmation", async ({ page }) => {
    await page.goto("/inbox");
    const box = page.getByLabel("Link or note");
    await box.fill("https://example.com/a");
    await box.press("Enter");
    await box.fill("A thought");
    await box.press("Enter");
    await expect(page.getByRole("article")).toHaveCount(2);
    await page.getByRole("checkbox", { name: /Select A thought/ }).check();
    await page.getByRole("region", { name: "Selection" }).getByRole("button", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("article")).toHaveCount(1);
    expect(await serious(page)).toEqual([]);
  });

  test("the iOS note is in the help text", async ({ page }) => {
    await page.goto("/inbox");
    await page.getByText("How to send things to your Inbox").click();
    await expect(page.getByText(/iPhone and iPad: Safari can't share into web apps/)).toBeVisible();
  });

  test("a POST to /share-target that never reaches the service worker is only redirected, and stores nothing", async ({ playwright, baseURL }) => {
    const api = await playwright.request.newContext({ baseURL });
    const res = await api.post("/share-target", { multipart: { title: "Hi", url: "https://example.com", media: { name: "a.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not really") } }, maxRedirects: 0 });
    expect(res.status()).toBe(303);
    expect(res.headers().location).toBe("/inbox");
    const get = await api.get("/share-target", { maxRedirects: 0 });
    expect(get.status()).toBe(303);
    await api.dispose();
  });
});
