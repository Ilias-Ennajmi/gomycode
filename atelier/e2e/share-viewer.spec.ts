import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { aspectsOf, paintAssets, seed, seedOp, type Seeded } from "./support/images";
import { touchDrag } from "./helpers";

/*
 * The client-facing share page on a real server (local-only mode: an in-memory share store seeded through /api/test/seed-share)
 * and real pages. Pictures are generated and served by the test (e2e/support/images.ts). Set SHARE_SHOTS=<dir> to keep screenshots.
 */

const SHOTS = process.env.SHARE_SHOTS;
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const serious = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(SHOTS, `${test.info().project.name}-${name}.png`) });
}

const SPEC = {
  title: "Brand refresh",
  frames: [
    { name: "Direction A", images: 4, sticky: "Warm, tactile", notes: "SECRET PRESENTER NOTES" },
    { name: "Direction B", images: 3 },
    { name: "Direction C", images: 6, w: 1200, h: 1200 },
  ],
};

/** A seeded board and a page that can load its pictures. Returns what was asked of the picture host, for the variant checks. */
async function open(page: Page, extra: Record<string, unknown> = {}, opts: { path?: string } = {}): Promise<{ made: Seeded; asked: string[]; spec: typeof SPEC }> {
  const asked: string[] = [];
  const aspects: Record<string, number> = {};
  await paintAssets(page, asked, aspects);
  const spec = { ...SPEC, ...extra } as typeof SPEC;
  const made = await seed(page, spec);
  Object.assign(aspects, aspectsOf(spec, made));
  await page.goto(opts.path ?? `/s/${made.token}`);
  return { made, asked, spec };
}

const status = (page: Page) => page.locator(".vw-sr[aria-live]");
const settle = (page: Page) => page.waitForTimeout(400); // the 150 ms zoom transition

test.describe("share page: first paint and gates", () => {
  test("the server's HTML already has the first slide's picture, and the headers keep the link private", async ({ page }) => {
    const made = await seed(page, SPEC);
    const res = await page.request.get(`/s/${made.token}`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/<img class="vw-preview-lo"[^>]*src="https:\/\/assets\.example\.test\/p\/seed\/[^"]+-w480\.webp"/);
    expect(html).toMatch(/fetchPriority="high"/i);
    expect(html).toMatch(/srcSet="[^"]*480w[^"]*1280w/i);
    expect(html).toContain("Brand refresh");
    expect(html).not.toContain("SECRET PRESENTER NOTES");
    const h = res.headers();
    expect(h["referrer-policy"]).toBe("no-referrer");
    expect(h["x-robots-tag"]).toBe("noindex, nofollow");
    expect(h["cache-control"]).toBe("private, no-store");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"]).toContain("https://assets.example.test");
  });

  test("a revoked link, an unknown link and a malformed one are one identical page", async ({ page }) => {
    const gone = await seed(page, SPEC);
    await seedOp(page, "revoke", gone.linkId);
    const bodies: string[] = [];
    for (const path of [`/s/${gone.token}`, `/s/${"A".repeat(43)}`, "/s/nope"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "This link isn't available" })).toBeVisible();
      bodies.push(await page.locator("main").innerText());
    }
    expect(new Set(bodies).size).toBe(1);
    expect(bodies[0]).not.toMatch(/revoked|expired|password/i);
    await shot(page, "gone");
    expect(await serious(page)).toEqual([]);
  });

  test("password gate: label, wrong password, then the board; no title before the gate", async ({ page }) => {
    const { made } = await open(page, { password: "hunter22" });
    await expect(page.getByRole("heading", { name: "This board is private" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Brand refresh");
    const input = page.getByLabel("Password", { exact: true });
    await expect(input).toHaveAttribute("autocomplete", "current-password");
    await shot(page, "password");
    expect(await serious(page)).toEqual([]);
    await input.fill("wrong-one");
    await page.getByRole("button", { name: "Open board" }).click();
    await expect(page.getByRole("status").filter({ hasText: "That password isn" })).toBeVisible();
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await shot(page, "password-wrong");
    await input.fill("hunter22");
    await page.getByRole("button", { name: "Open board" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Brand refresh" })).toBeVisible();
    // the cookie is kept: a reload goes straight in
    await page.goto(`/s/${made.token}`);
    await expect(page.getByRole("heading", { level: 1, name: "Brand refresh" })).toBeVisible();
    expect(await serious(page)).toEqual([]);
  });

  test("revoking mid-visit sends the next call to the unavailable page", async ({ page }) => {
    const { made } = await open(page);
    await expect(page.getByRole("heading", { level: 1, name: "Brand refresh" })).toBeVisible();
    await seedOp(page, "revoke", made.linkId);
    await page.reload();
    await expect(page.getByRole("heading", { name: "This link isn't available" })).toBeVisible();
  });
});

test.describe("share page: viewing", () => {
  test("slides: keys, buttons, thumbnails, announcements; the welcome note once", async ({ page }, info) => {
    const { made } = await open(page, { welcomeNote: "Hello <b>there</b>" });
    const welcome = page.getByRole("dialog", { name: "Welcome" });
    await expect(welcome).toContainText("Hello <b>there</b>");
    await shot(page, "welcome");
    expect(await serious(page)).toEqual([]);
    await welcome.getByRole("button", { name: "View the board" }).click();
    await expect(welcome).toBeHidden();
    await shot(page, "slides");
    expect(await serious(page)).toEqual([]);

    const strip = page.getByRole("navigation", { name: "Slides" });
    await expect(strip.getByRole("button")).toHaveCount(3);
    if (info.project.name !== "phone") {
      await page.keyboard.press("ArrowRight");
      await expect(status(page)).toHaveText("Slide 2 of 3: Direction B");
      await page.keyboard.press("End");
      await expect(status(page)).toHaveText("Slide 3 of 3: Direction C");
      await page.keyboard.press("Home");
      await expect(status(page)).toHaveText("Slide 1 of 3: Direction A");
    }
    await page.getByRole("button", { name: "Next slide" }).click();
    await expect(status(page)).toHaveText("Slide 2 of 3: Direction B");
    await strip.getByRole("button", { name: /Slide 3/ }).click();
    await expect(strip.getByRole("button", { name: /Slide 3/ })).toHaveAttribute("aria-current", "true");
    // a reload does not show the note again
    await page.goto(`/s/${made.token}`);
    await expect(page.getByRole("heading", { level: 1, name: "Brand refresh" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Welcome" })).toHaveCount(0);
  });

  test("a swipe changes slide on a touch screen", async ({ page }, info) => {
    test.skip(info.project.name !== "phone", "touch only");
    await open(page);
    const box = (await page.locator(".vw-zoom").boundingBox())!;
    const y = box.y + box.height / 2;
    await touchDrag(page, [{ x: box.x + box.width * 0.8, y }, { x: box.x + box.width * 0.6, y }, { x: box.x + box.width * 0.3, y }]);
    await expect(status(page)).toHaveText("Slide 2 of 3: Direction B");
    await touchDrag(page, [{ x: box.x + box.width * 0.2, y }, { x: box.x + box.width * 0.5, y }, { x: box.x + box.width * 0.8, y }]);
    await expect(status(page)).toHaveText("Slide 1 of 3: Direction A");
  });

  test("zooming a slide loads the live objects with sharper files, and a tap opens a picture at full resolution", async ({ page }) => {
    const { asked } = await open(page);
    await expect(page.getByRole("heading", { level: 1, name: "Brand refresh" })).toBeVisible();
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(page.locator(".vw-live[data-ready]")).toBeVisible();
    await settle(page);
    await shot(page, "zoomed");
    await expect.poll(() => asked.some((p) => /\/w1024\.webp$|\/w2048\.webp$/.test(p))).toBe(true);
    await page.getByRole("button", { name: "Fit to screen" }).click();
    await expect(page.locator(".vw-live")).toHaveCount(0);
    await settle(page);

    const box = (await page.locator(".vw-zoom-box").boundingBox())!;
    asked.length = 0;
    await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.2);
    const dialog = page.getByRole("dialog", { name: /image 1 of 4/ });
    await expect(dialog).toBeVisible();
    await shot(page, "lightbox");
    expect(await serious(page)).toEqual([]);
    for (let i = 0; i < 6; i++) await dialog.getByRole("button", { name: "Zoom in" }).click();
    await expect.poll(() => asked.some((p) => /\/original$/.test(p))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("pinching zooms (touch)", async ({ page }, info) => {
    test.skip(info.project.name !== "phone", "touch only");
    await open(page);
    await expect(page.getByRole("heading", { level: 1, name: "Brand refresh" })).toBeVisible();
    const box = (await page.locator(".vw-zoom").boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const cdp = await page.context().newCDPSession(page);
    const pts = (d: number) => [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(30) });
    for (const d of [50, 80, 110, 140]) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(d) });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
    await expect.poll(async () => Number(await page.locator(".vw-zoom-box").getAttribute("data-zoom"))).toBeGreaterThan(1.5);
    await expect(page.locator(".vw-live")).toHaveCount(1);
  });

  test("free roam: pan and zoom the whole board; a tap on a picture opens it", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Free roam" }).click();
    const canvas = page.locator(".vw-canvas");
    await expect(canvas).toBeVisible();
    await expect(page.locator('[data-object-type="image"]').first()).toBeVisible();
    await shot(page, "freeroam");
    expect(await serious(page)).toEqual([]);
    const z0 = Number(await canvas.getAttribute("data-zoom"));
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect.poll(async () => Number(await canvas.getAttribute("data-zoom"))).toBeGreaterThan(z0);
    // a slide chosen in the strip is brought into view
    await page.getByRole("navigation", { name: "Slides" }).getByRole("button", { name: /Slide 2/ }).click();
    await expect(page.locator('[data-object-type="frame"]').first()).toBeAttached();
    await page.getByRole("button", { name: "Free roam" }).click();
    await expect(page.locator(".vw-canvas")).toHaveCount(0);
  });

  test("stickies and links draw their text as text", async ({ page }) => {
    await open(page);
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(page.locator('[data-object-type="sticky"]')).toContainText("Warm, tactile");
  });
});

test.describe("share page: layout and options", () => {
  for (const [w, h] of [[375, 667], [320, 568]] as const) {
    test(`no sideways scroll at ${w}px, in every state`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      const { made } = await open(page, { welcomeNote: "A note", password: "pw-123" });
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(await overflow()).toBeLessThanOrEqual(0);
      await page.getByLabel("Password", { exact: true }).fill("pw-123");
      await page.getByRole("button", { name: "Open board" }).click();
      await expect(page.getByRole("dialog", { name: "Welcome" })).toBeVisible();
      expect(await overflow()).toBeLessThanOrEqual(0);
      await page.getByRole("button", { name: "View the board" }).click();
      expect(await overflow()).toBeLessThanOrEqual(0);
      await page.getByRole("button", { name: "Free roam" }).click();
      expect(await overflow()).toBeLessThanOrEqual(0);
      await page.getByRole("button", { name: "Free roam" }).click();
      const box = (await page.locator(".vw-zoom-box").boundingBox())!;
      await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.2);
      await expect(page.getByRole("dialog", { name: /image/ })).toBeVisible();
      expect(await overflow()).toBeLessThanOrEqual(0);
      void made;
    });
  }

  test("download, credits and watermark show only when the link allows them", async ({ page }) => {
    await open(page);
    await expect(page.getByRole("heading", { level: 1, name: "Brand refresh" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Credits" })).toHaveCount(0);
    await expect(page.locator(".vw-watermark")).toHaveCount(0);

    await open(page, { allowDownload: true, showCredits: true, watermark: true, credit: "Photo by Jane Doe", welcomeNote: "" });
    await expect(page.locator(".vw-watermark")).toHaveCount(1);
    await expect(page.locator(".vw-watermark")).toHaveAttribute("aria-hidden", "true");
    await page.getByRole("button", { name: "Credits" }).click();
    await expect(page.locator(".vw-credit-chip").first()).toContainText("Photo by Jane Doe");
    await page.getByRole("button", { name: "Download" }).click();
    await expect(page.getByRole("dialog", { name: "Download" })).toContainText("convenience");
    await shot(page, "download");
    expect(await serious(page)).toEqual([]);
    await page.keyboard.press("Escape");
  });

  test("offline: a friendly note, and it goes away when the connection returns", async ({ page, context }) => {
    await open(page);
    await expect(page.getByRole("heading", { level: 1, name: "Brand refresh" })).toBeVisible();
    await context.setOffline(true);
    await expect(page.getByText(/You.re offline/)).toBeVisible();
    await shot(page, "offline");
    await context.setOffline(false);
    await expect(page.getByText(/You.re offline/)).toBeHidden();
  });

  test("a frames-scope link shows only its frames, and dark mode is designed too", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await open(page, { scope: "frames", scopeFrames: [1] });
    await expect(page.getByRole("heading", { level: 1, name: "Brand refresh" })).toBeVisible();
    await expect(page.locator(".vw-strip")).toHaveCount(0); // one slide: no strip
    await expect(page.getByRole("group", { name: /Slide 1 of 1: Direction B/ })).toBeVisible();
    await shot(page, "dark-one-slide");
    expect(await serious(page)).toEqual([]);
  });
});
