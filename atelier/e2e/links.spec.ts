import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { expectCount, objectsOfType, openBoard, pasteData, selectedIds } from "./helpers";

// A 1x1 PNG: the og:image the mocked preview points at.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

/** Local-only mode has no preview route (503); these tests stand in for a signed-in server. */
async function mockPreviews(page: Page, thirdParty: string[] = []) {
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.hostname !== "localhost" && u.protocol.startsWith("http")) thirdParty.push(r.url());
  });
  await page.route("**/api/link-preview", async (route) => {
    const { url } = JSON.parse(route.request().postData() ?? "{}") as { url: string };
    if (url.includes("broken")) return route.fulfill({ status: 502, contentType: "application/json", body: '{"error":"unreachable"}' });
    return route.fulfill({
      json: { title: "A <b>quiet</b> page", description: "Plain words about it.", siteName: "Example Journal", imageUrl: "https://cdn.example.com/og.png", faviconUrl: null, finalUrl: url },
    });
  });
  await page.route("**/api/link-preview/image**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
}

const serious = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);

test.describe("link cards and embeds", () => {
  test("a pasted URL becomes a link card that loads its preview as plain text with a thumbnail", async ({ page }) => {
    await mockPreviews(page);
    await openBoard(page);
    await pasteData(page, { text: "https://example.com/journal/quiet" });
    const [card] = await expectCount(page, 1, "link");
    await expect.poll(async () => (await objectsOfType(page, "link"))[0].status).toBe("ready");
    expect((await objectsOfType(page, "link"))[0]).toMatchObject({ title: "A <b>quiet</b> page", url: "https://example.com/journal/quiet" });
    expect((await objectsOfType(page, "link"))[0].imageAssetId).toBeTruthy();
    const el = page.locator(`[data-object-id="${card.id}"]`);
    await expect(el).toContainText("A <b>quiet</b> page");
    expect(await el.locator("b").count()).toBe(0);
    const a = el.locator("a");
    await expect(a).toHaveAttribute("rel", "noopener noreferrer nofollow");
    await expect(a).toHaveAttribute("target", "_blank");
    await expect(el.locator("img")).toHaveCount(1);
  });

  test("a failed preview shows 'Preview unavailable' and can be retried", async ({ page }) => {
    await mockPreviews(page);
    await openBoard(page);
    await pasteData(page, { text: "https://broken.example/page" });
    const [card] = await expectCount(page, 1, "link");
    await expect.poll(async () => (await objectsOfType(page, "link"))[0].status).toBe("failed");
    const el = page.locator(`[data-object-id="${card.id}"]`);
    await expect(el).toContainText("Preview unavailable");
    await page.unroute("**/api/link-preview");
    await page.route("**/api/link-preview", (route) =>
      route.fulfill({ json: { title: "Fixed", description: "", siteName: "S", imageUrl: null, faviconUrl: null, finalUrl: "https://broken.example/page" } }),
    );
    await el.getByRole("button", { name: "Retry preview" }).click();
    await expect.poll(async () => (await objectsOfType(page, "link"))[0].status).toBe("ready");
    await expect(el).toContainText("Fixed");
  });

  test("without a server (local-only) a pasted URL is a plain card with just the domain", async ({ page }) => {
    await openBoard(page); // no mocks: /api/link-preview answers 503 in local-only mode
    await pasteData(page, { text: "https://example.com/journal/quiet" });
    await expectCount(page, 1, "link");
    await expect.poll(async () => (await objectsOfType(page, "link"))[0].status).toBe("ready");
    expect(await objectsOfType(page, "link")).toMatchObject([{ title: "example.com", description: "" }]);
  });

  test("a pasted YouTube URL is a facade: no iframe and no third-party request until Play", async ({ page }) => {
    const thirdParty: string[] = [];
    await mockPreviews(page, thirdParty);
    await page.route("https://www.youtube-nocookie.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>player</title><p>player</p>" }));
    await openBoard(page);
    await pasteData(page, { text: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    const [embed] = await expectCount(page, 1, "embed");
    expect(embed).toMatchObject({ provider: "youtube", embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" });
    const el = page.locator(`[data-object-id="${embed.id}"]`);
    await expect(el.getByRole("button", { name: /^Play/ })).toBeVisible();
    await expect(page.locator("iframe")).toHaveCount(0);
    expect(thirdParty).toEqual([]);

    await el.getByRole("button", { name: /^Play/ }).click();
    const frame = page.locator("iframe");
    await expect(frame).toHaveCount(1);
    await expect(frame).toHaveAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation allow-popups");
    await expect(frame).toHaveAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    await expect(frame).toHaveAttribute("loading", "lazy");
    await expect(frame).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");

    await page.getByRole("button", { name: "Stop and show the preview again" }).click();
    await expect(page.locator("iframe")).toHaveCount(0);
  });

  test("lookalike, file: and prose URLs never become embeds or cards", async ({ page }) => {
    await mockPreviews(page);
    await openBoard(page);
    await pasteData(page, { text: "file:///etc/passwd" });
    await pasteData(page, { text: "javascript:alert(1)" });
    await pasteData(page, { text: "watch https://www.youtube.com/watch?v=dQw4w9WgXcQ later" });
    await expectCount(page, 3, "text");
    await pasteData(page, { text: "https://youtube.com.evil.io/watch?v=dQw4w9WgXcQ" });
    await expectCount(page, 1, "link");
    expect(await objectsOfType(page, "embed")).toEqual([]);
    await expect(page.locator("iframe")).toHaveCount(0);
  });

  test("Mod+Shift+V pastes a URL as linked text", async ({ page }) => {
    await mockPreviews(page);
    await openBoard(page);
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "V", ctrlKey: true, shiftKey: true, bubbles: true })));
    await pasteData(page, { text: "https://example.com/a" });
    await expectCount(page, 1, "text");
    expect(await objectsOfType(page, "link")).toEqual([]);
  });

  test("five pasted URLs make five cards without overlap", async ({ page }) => {
    await mockPreviews(page);
    await openBoard(page);
    await pasteData(page, { text: Array.from({ length: 5 }, (_, i) => `https://example.com/p${i}`).join("\n") });
    const cards = await expectCount(page, 5, "link");
    for (let i = 0; i < cards.length; i++)
      for (let j = i + 1; j < cards.length; j++) {
        const a = cards[i];
        const b = cards[j];
        expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h, `${i}/${j}`).toBe(false);
      }
    await expect.poll(async () => (await objectsOfType(page, "link")).every((c) => c.status === "ready")).toBe(true);
  });
});

test.describe("More menu", () => {
  test("is a menu on the toolbar, works from the keyboard, and adds a link card and an embed through the dialog", async ({ page }) => {
    await mockPreviews(page);
    await openBoard(page);
    const more = page.getByRole("button", { name: "More objects" });
    await expect(more).toBeVisible();
    await more.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu", { name: "More objects" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem").first()).toBeFocused();
    expect(await serious(page)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(more).toBeFocused();

    await more.click();
    await page.getByRole("menuitem", { name: /Link card/ }).click();
    const dialog = page.getByRole("dialog", { name: /link card/i });
    await expect(dialog.getByLabel("Web address")).toBeFocused();
    await dialog.getByLabel("Web address").fill("not a url");
    await page.keyboard.press("Enter");
    await expect(dialog.getByRole("alert")).toContainText("https://");
    expect(await serious(page)).toEqual([]);
    await dialog.getByLabel("Web address").fill("https://example.com/from-dialog");
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expectCount(page, 1, "link");
    expect(await selectedIds(page)).toHaveLength(1);

    await more.click();
    await page.getByRole("menuitem", { name: /Embed video or design/ }).click();
    const d2 = page.getByRole("dialog", { name: /embed/i });
    await d2.getByLabel("Web address").fill("https://example.com/not-a-video");
    await page.keyboard.press("Enter");
    await expect(d2.getByRole("alert")).toContainText("YouTube, Vimeo");
    await d2.getByLabel("Web address").fill("https://vimeo.com/76979871");
    await page.keyboard.press("Enter");
    await expectCount(page, 1, "embed");
    expect(await objectsOfType(page, "embed")).toMatchObject([{ provider: "vimeo", embedUrl: "https://player.vimeo.com/video/76979871" }]);
  });

  test("every toolbar button is reachable and at least 44 px on touch, and More never scrolls away", async ({ page }, info) => {
    test.skip(info.project.name !== "phone", "phone layout");
    await openBoard(page);
    const tools = page.getByRole("toolbar", { name: "Tools" });
    const scroller = tools.locator("[data-toolbar-scroll]");
    const names = ["Select", "Hand", "Sticky note", "Text", "Shapes", "Arrow or line", "Pen", "Frame", "Image", "More objects"];
    const vw = page.viewportSize()!.width;
    for (const name of names) {
      const b = tools.getByRole("button", { name, exact: true });
      await b.scrollIntoViewIfNeeded();
      await expect(b).toBeVisible();
      const box = (await b.boundingBox())!;
      expect(box.width, name).toBeGreaterThanOrEqual(44);
      expect(box.height, name).toBeGreaterThanOrEqual(44);
      expect(box.x, name).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, name).toBeLessThanOrEqual(vw);
    }
    // More stays put whatever the tools did.
    await scroller.evaluate((el) => (el.scrollLeft = 0));
    const more = tools.getByRole("button", { name: "More objects" });
    const before = (await more.boundingBox())!;
    await scroller.evaluate((el) => (el.scrollLeft = 100000));
    const after = (await more.boundingBox())!;
    expect(Math.abs(before.x - after.x)).toBeLessThan(1);
    expect(await serious(page)).toEqual([]);
  });
});
