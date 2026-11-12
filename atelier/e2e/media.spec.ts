import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { type FileSpec, dropData, objects, objectsOfType, openBoard, selectIds, toasts } from "./helpers";

const fixture = (name: string, type: string): FileSpec => ({ name, type, base64: readFileSync(join(__dirname, "fixtures", name)).toString("base64") });
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function serious(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => ({ id: v.id, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) }));
}

async function addClip(page: Page) {
  await dropData(page, { files: [fixture("clip.webm", "video/webm")] });
  await expect.poll(async () => (await objectsOfType(page, "video")).length).toBe(1);
  const [v] = await objectsOfType(page, "video");
  return v;
}

test.describe("video and GIF", () => {
  test("a dropped webm shows its poster, plays on Enter, and its frame can be grabbed as a picture", async ({ page }) => {
    await openBoard(page);
    const v = await addClip(page);
    expect(v).toMatchObject({ kind: "video", muted: true, loop: false });

    const card = page.locator(`[data-object-id="${v.id}"]`);
    await expect(card.locator("img")).toHaveCount(1);
    await expect(card.locator("video")).toHaveCount(0); // nothing plays, nothing is even loaded, until asked

    await selectIds(page, [v.id]);
    await page.locator("#board-canvas").focus();
    await page.keyboard.press("Enter");
    await expect(card.locator("video")).toHaveCount(1);
    await expect.poll(() => card.locator("video").evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(0.3);
    expect(await card.locator("video").evaluate((el: HTMLVideoElement) => el.hasAttribute("autoplay"))).toBe(false);

    await page.getByRole("button", { name: "Pause video" }).click();
    await page.getByRole("button", { name: "Grab frame as image" }).click();
    await expect.poll(async () => (await objectsOfType(page, "image")).length).toBe(1);
    const [img] = await objectsOfType(page, "image");
    expect(img.x).toBeGreaterThanOrEqual(v.x + v.w); // next to the video, not on it

    expect(await serious(page)).toEqual([]);

    await page.keyboard.press("Escape");
    await expect(card.locator("video")).toHaveCount(0); // back to the poster
  });

  test("Escape and the budget: only three videos are live at a time", async ({ page }) => {
    await openBoard(page);
    for (let i = 0; i < 4; i++) {
      await page.evaluate((i) => {
        const { doc } = (window as unknown as { __atelier: { doc: { create(o: unknown): string } } }).__atelier;
        doc.create({ type: "video", x: -300 + i * 160, y: -100, w: 150, h: 84, rotation: 0, opacity: 1, locked: false, parentId: null, assetId: "", kind: "video", posterTime: 0, loop: false, muted: true, posterAssetId: null, provenance: null });
      }, i);
    }
    const videos = await objectsOfType(page, "video");
    for (const v of videos) {
      await selectIds(page, [v.id]);
      await page.locator("#board-canvas").focus();
      await page.keyboard.press("Enter");
    }
    await expect.poll(() => page.locator("[data-media-state]:not([data-media-state='off'])").count()).toBe(3);
  });

  test("a dropped GIF is a GIF card: a still with a Play affordance until played", async ({ page }) => {
    await openBoard(page);
    await dropData(page, { files: [fixture("loop.gif", "image/gif")] });
    await expect.poll(async () => (await objectsOfType(page, "video")).length).toBe(1);
    const [g] = await objectsOfType(page, "video");
    expect(g).toMatchObject({ kind: "gif", loop: true, muted: true });
    const card = page.locator(`[data-object-id="${g.id}"]`);
    await expect(card.getByText("GIF")).toBeVisible();
    await expect(card.locator("[data-play-badge]")).toBeVisible();
    const srcs = () => card.locator("img").evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src));
    expect((await srcs()).length).toBe(1);

    await selectIds(page, [g.id]);
    await page.getByRole("button", { name: "Play GIF" }).click();
    await expect.poll(async () => (await srcs()).length).toBe(2); // the still stays underneath the animation
    await page.getByRole("button", { name: "Pause GIF" }).click();
    await expect.poll(async () => (await srcs()).length).toBe(1);
  });

  test("a 210 MB mp4 is refused by name and nothing is added", async ({ page }) => {
    await openBoard(page);
    await dropData(page, { files: [{ name: "huge.mp4", type: "video/mp4", size: 210 * 1024 * 1024 }] });
    await expect(toasts(page).filter({ hasText: "Couldn't add huge.mp4: too large" })).toBeVisible();
    await expect(toasts(page).filter({ hasText: "200 MB" })).toBeVisible();
    expect(await objects(page)).toHaveLength(0);
  });
});

test.describe("type specimen", () => {
  // The production build's service worker would answer (or forward) the font requests outside page.route.
  test.use({ serviceWorkers: "block" });

  test("three families offline fall back to a system font with a text badge, and the Inspector edits them", async ({ page }) => {
    await page.route("https://fonts.googleapis.com/**", (r) => r.abort());
    await openBoard(page);
    await page.evaluate(() => {
      const { doc } = (window as unknown as { __atelier: { doc: { create(o: unknown): string } } }).__atelier;
      [["Playfair Display", 700], ["Lora", 400], ["Space Mono", 400]].forEach(([family, weight], i) =>
        doc.create({ type: "typeSpecimen", x: -540 + i * 380, y: -100, w: 360, h: 200, rotation: 0, opacity: 1, locked: false, parentId: null, family, weight, italic: false, sample: "Handgloves", size: 40, licenceNote: "SIL OFL 1.1", sourceUrl: "" }),
      );
    });
    await expect(page.getByText("Font unavailable offline")).toHaveCount(3);

    const [first] = await objectsOfType(page, "typeSpecimen");
    await selectIds(page, [first.id]);
    await page.getByRole("button", { name: /^Type:/ }).click();
    const family = page.getByRole("combobox", { name: "Font family" });
    await family.fill("Inter; } body{");
    await expect(page.getByText(/letters, numbers, spaces and hyphens/i)).toBeVisible();
    expect(await serious(page)).toEqual([]);
    await family.fill("Inter");
    await expect.poll(async () => ((await objectsOfType(page, "typeSpecimen")).find((o) => o.id === first.id) as { family?: string }).family).toBe("Inter");
  });

  test("a board without specimens never contacts Google Fonts", async ({ page }) => {
    const hits: string[] = [];
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => {
      hits.push(r.request().url());
      return r.abort();
    });
    await openBoard(page);
    await page.waitForTimeout(500);
    expect(hits).toEqual([]);
  });
});
