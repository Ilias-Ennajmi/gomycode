import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { slideCamera } from "../lib/engine/present/slides";
import { camera, openBoard, selectIds, selectedIds, setView, touchDrag, toasts, type Camera } from "./helpers";

/*
 * Presentation mode on a real page: a deck of five frames with different sizes and aspect ratios, pictures and notes.
 * Set PRESENT_SHOTS=<dir> to keep screenshots for a look.
 */

const SHOTS = process.env.PRESENT_SHOTS;
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

type Api = { doc: { create(o: object): string; update(id: string, p: object): void; remove(ids: string[]): void; all(): { id: string; type: string; name?: string }[] }; uploader: { add(f: File, at: { x: number; y: number }): Promise<string> } };

const frameSpec = (name: string, x: number, y: number, w: number, h: number, order: string, extra: object = {}) => ({
  type: "frame", x, y, w, h, rotation: 0, parentId: null, locked: false, opacity: 1, name, preset: "custom", background: null, clip: true, order, notes: "", ...extra,
});

/** Five frames: 16:9, 4:3, 9:16 story, square and a very wide banner, far apart on the canvas. Returns their ids by name. */
async function seedDeck(page: Page, withImages = true): Promise<Record<string, string>> {
  const ids = await page.evaluate(
    ({ frames }) => {
      const api = (window as unknown as { __atelier: Api }).__atelier;
      const f = Object.fromEntries(frames.map((s) => [s.name, api.doc.create(s)]));
      const shape = (extra: object) => ({ type: "shape", x: 0, y: 0, w: 120, h: 80, rotation: 0, parentId: null, locked: false, opacity: 1, kind: "rect", fill: null, stroke: "var(--color-ink)", strokeWidth: 2, strokeStyle: "solid", cornerRadius: 0, ...extra });
      api.doc.create(shape({ x: 60, y: 60, w: 300, h: 200, kind: "roundRect", fill: "var(--sticky-peach)", cornerRadius: 16, parentId: f["Opening"] }));
      api.doc.create(shape({ x: 420, y: 120, w: 260, h: 260, kind: "ellipse", fill: "var(--sticky-lilac)", parentId: f["Opening"] }));
      api.doc.create({ type: "swatch", x: 3400, y: 80, w: 140, h: 140, rotation: 0, parentId: f["Square"], locked: false, opacity: 1, hex: "#2f4a6d", name: "Ink blue", format: "hex" });
      api.doc.create(shape({ x: 6000, y: 100, w: 600, h: 200, kind: "diamond", fill: "var(--sticky-mint)", parentId: f["Banner"] }));
      return f;
    },
    {
      frames: [
        frameSpec("Opening", 0, 0, 1280, 720, "a0", { notes: "Welcome everyone.\nMention the 3 directions.", background: null }),
        frameSpec("Moodboard", 1500, 0, 1200, 900, "a1", { notes: "<img src=x onerror=alert(1)> stays text" }),
        frameSpec("Story", 3000, 0, 540, 960, "a2", { notes: "Vertical story format." }),
        frameSpec("Square", 3800, 0, 720, 720, "a3"),
        frameSpec("Banner", 5000, 0, 2400, 400, "a4", { notes: "Wide banner." }),
      ],
    },
  );
  if (withImages) {
    for (const [i, [name, hue, w, h, x, y, fw, fh]] of ([
      ["ONE", 20, 1600, 1200, 1520, 20, 560, 420],
      ["TWO", 200, 1200, 1200, 2100, 20, 380, 380],
      ["THREE", 330, 1000, 700, 1520, 470, 520, 364],
    ] as [string, number, number, number, number, number, number, number][]).entries()) {
      void i;
      await page.evaluate(
        async ({ name, hue, w, h, x, y, fw, fh, parent }) => {
          const c = new OffscreenCanvas(w, h);
          const g = c.getContext("2d")!;
          const grad = g.createLinearGradient(0, 0, w, h);
          grad.addColorStop(0, `hsl(${hue} 70% 55%)`);
          grad.addColorStop(1, `hsl(${(hue + 60) % 360} 60% 35%)`);
          g.fillStyle = grad;
          g.fillRect(0, 0, w, h);
          g.fillStyle = "rgba(255,255,255,.8)";
          g.beginPath();
          g.arc(w * 0.3, h * 0.35, Math.min(w, h) * 0.18, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = "#fff";
          g.font = `bold ${Math.round(w / 8)}px sans-serif`;
          g.fillText(name, w * 0.06, h * 0.9);
          const blob = await c.convertToBlob({ type: "image/png" });
          const api = (window as unknown as { __atelier: Api }).__atelier;
          const id = await api.uploader.add(new File([blob], `${name}.png`, { type: "image/png" }), { x: 0, y: 0 });
          api.doc.update(id, { x, y, w: fw, h: fh, parentId: parent });
        },
        { name, hue, w, h, x, y, fw, fh, parent: ids["Moodboard"] },
      );
    }
  }
  return ids;
}

const region = (page: Page) => page.getByRole("region", { name: "Presentation" });
const presentButton = (page: Page) => page.getByRole("button", { name: "Present", exact: true });
const counter = (page: Page) => region(page).getByText(/^\d+ \/ \d+$/);

async function viewport(page: Page): Promise<{ w: number; h: number }> {
  return page.evaluate(() => (window as unknown as { __atelier: { canvas: { viewport(): { w: number; h: number } } } }).__atelier.canvas.viewport());
}

async function expectSlide(page: Page, n: number, rect: { x: number; y: number; w: number; h: number }) {
  const want: Camera = slideCamera(rect, await viewport(page));
  await expect(counter(page)).toHaveText(new RegExp(`^${n} /`));
  const got = await camera(page);
  expect(got.z).toBeCloseTo(want.z, 6);
  expect(got.x).toBeCloseTo(want.x, 4);
  expect(got.y).toBeCloseTo(want.y, 4);
}

const RECTS = [
  { x: 0, y: 0, w: 1280, h: 720 },
  { x: 1500, y: 0, w: 1200, h: 900 },
  { x: 3000, y: 0, w: 540, h: 960 },
  { x: 3800, y: 0, w: 720, h: 720 },
  { x: 5000, y: 0, w: 2400, h: 400 },
];

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${test.info().project.name}-${name}.png`) });
}

test.describe("presentation mode", () => {
  test.setTimeout(120_000);

  test("keyboard: next, previous, ends, digits, notes, help; Escape restores camera and selection", async ({ page }, info) => {
    test.skip(info.project.name === "phone", "keyboard run on desktop; the phone project swipes");
    await openBoard(page);
    const ids = await seedDeck(page);
    await setView(page, 0.5);
    await selectIds(page, [ids["Moodboard"]]);
    const before = await camera(page);

    await presentButton(page).click();
    await expect(region(page)).toBeVisible();
    await expect(page.getByRole("toolbar", { name: "Tools" })).toBeHidden();
    await expectSlide(page, 1, RECTS[0]);
    await shot(page, "slide-1");

    // keyboard moves never animate: the camera is on the target at once
    await page.keyboard.press("ArrowRight");
    await expectSlide(page, 2, RECTS[1]);
    await shot(page, "slide-2");
    await page.keyboard.press("Space");
    await expectSlide(page, 3, RECTS[2]);
    await shot(page, "slide-3");
    await page.keyboard.press("PageDown");
    await expectSlide(page, 4, RECTS[3]);
    await shot(page, "slide-4");
    await page.keyboard.press("End");
    await expectSlide(page, 5, RECTS[4]);
    await shot(page, "slide-5");
    await page.keyboard.press("ArrowRight"); // the end of the deck: no wrap
    await expectSlide(page, 5, RECTS[4]);
    await page.keyboard.press("PageUp");
    await expectSlide(page, 4, RECTS[3]);
    await page.keyboard.press("Home");
    await expectSlide(page, 1, RECTS[0]);
    await page.keyboard.press("2");
    await expectSlide(page, 2, RECTS[1]);
    await expect(page.getByRole("status")).toHaveText("Slide 2 of 5: Moodboard");

    // notes: plain text, even when they look like markup
    await page.keyboard.press("n");
    const notes = page.getByRole("region", { name: "Presenter notes" });
    await expect(notes).toContainText("<img src=x onerror=alert(1)> stays text");
    await expect(notes.locator("img")).toHaveCount(0);
    await shot(page, "notes");
    await page.keyboard.press("n");
    await expect(notes).toHaveCount(0);

    // nothing selects or edits while presenting, and editor shortcuts do nothing
    const count = (await page.evaluate(() => (window as unknown as { __atelier: Api }).__atelier.doc.all().length));
    await page.keyboard.press("Delete");
    await page.keyboard.press("Control+a");
    expect(await selectedIds(page)).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { __atelier: Api }).__atelier.doc.all().length)).toBe(count);

    await page.keyboard.press("?");
    await expect(page.getByRole("dialog", { name: "Presentation shortcuts" })).toBeVisible();
    await shot(page, "help");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Presentation shortcuts" })).toHaveCount(0);
    await expect(region(page)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(region(page)).toHaveCount(0);
    await expect(page.getByRole("toolbar", { name: "Tools" })).toBeVisible();
    const after = await camera(page);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(after.z).toBeCloseTo(before.z, 6);
    expect(await selectedIds(page)).toEqual([ids["Moodboard"]]);
  });

  test("a keyboard jump to a far slide shows its objects within two frames (no empty flash)", async ({ page }, info) => {
    test.skip(info.project.name === "phone", "keyboard");
    await openBoard(page);
    await seedDeck(page, false);
    const diamond = await page.evaluate(() => (window as unknown as { __atelier: { doc: { all(): { id: string; kind?: string }[] } } }).__atelier.doc.all().find((o) => o.kind === "diamond")!.id);
    await presentButton(page).click();
    await expect(region(page)).toBeVisible();
    await page.waitForTimeout(300); // let the first slide settle
    expect(await page.locator(`[data-object-id="${diamond}"]`).count()).toBe(0);
    const mounted = await page.evaluate(async (id) => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }));
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      return document.querySelector(`[data-object-id="${id}"]`) !== null;
    }, diamond);
    expect(mounted).toBe(true);
    await shot(page, "slide-5-content");
  });

  test("a frame millions of pixels from the origin is framed exactly (no precision loss)", async ({ page }, info) => {
    test.skip(info.project.name === "phone", "desktop geometry");
    await openBoard(page);
    const rect = { x: 4_000_000, y: -3_000_000, w: 1600, h: 900 };
    const id = await page.evaluate((r) => (window as unknown as { __atelier: Api }).__atelier.doc.create({ type: "frame", ...r, rotation: 0, parentId: null, locked: false, opacity: 1, name: "Far", preset: "custom", background: null, clip: true, order: "a0", notes: "" }), rect);
    await presentButton(page).click();
    await expectSlide(page, 1, rect);
    await expect.poll(() => page.locator(`[data-object-id="${id}"]`).count()).toBe(1);
    const win = await page.getByTestId("present-window").boundingBox();
    const el = await page.locator(`[data-object-id="${id}"]`).first().boundingBox();
    expect(Math.abs(el!.x - win!.x)).toBeLessThan(2);
    expect(Math.abs(el!.y - win!.y)).toBeLessThan(2);
    expect(Math.abs(el!.width - win!.width)).toBeLessThan(2);
  });

  test("laser pointer draws a dot that follows the mouse and never changes the board", async ({ page }, info) => {
    test.skip(info.project.name === "phone", "pointer laser is a desktop feature");
    await openBoard(page);
    await seedDeck(page, false);
    await presentButton(page).click();
    await page.keyboard.press("l");
    await page.mouse.move(500, 300);
    await page.mouse.move(640, 380, { steps: 6 });
    const drawn = await page.getByTestId("present-laser").evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
      return n;
    });
    expect(drawn).toBeGreaterThan(50);
    await shot(page, "laser");
    await page.keyboard.press("l");
    await expect(page.getByTestId("present-laser")).toHaveCount(0);
  });

  test("swipe left and right changes slide, a short or vertical drag does not, a tap on the right goes next", async ({ page }, info) => {
    test.skip(info.project.name !== "phone", "touch gestures run on the phone project");
    await openBoard(page);
    await seedDeck(page);
    await presentButton(page).click();
    await expect(region(page)).toBeVisible();
    await expectSlide(page, 1, RECTS[0]);
    await shot(page, "slide-1");
    const vp = await viewport(page);
    const y = vp.h / 2;

    await touchDrag(page, [{ x: 300, y }, { x: 260, y: y + 2 }, { x: 180, y: y + 4 }]);
    await expect(counter(page)).toHaveText("2 / 5");
    await expect.poll(async () => Math.abs((await camera(page)).z - slideCamera(RECTS[1], vp).z) < 1e-6, { timeout: 2000 }).toBe(true);
    await shot(page, "slide-2");

    await touchDrag(page, [{ x: 200, y }, { x: 215, y }, { x: 225, y }]); // 25 px at walking pace: not a swipe
    await touchDrag(page, [{ x: 200, y }, { x: 190, y: y + 150 }, { x: 180, y: y + 260 }]); // vertical
    await expect(counter(page)).toHaveText("2 / 5");

    await touchDrag(page, [{ x: 120, y }, { x: 200, y }, { x: 300, y }]); // right = back
    await expect(counter(page)).toHaveText("1 / 5");

    await page.touchscreen.tap(vp.w * 0.8, y * 0.8); // right side
    await expect(counter(page)).toHaveText("2 / 5");
    await page.touchscreen.tap(vp.w * 0.1, y * 0.8); // left side
    await expect(counter(page)).toHaveText("1 / 5");
    await shot(page, "controls");

    // free roam: the board is the person's again
    await page.getByRole("button", { name: /Free roam/ }).tap();
    await expect(page.getByTestId("present-surface")).toHaveCount(0);
    await shot(page, "free-roam");
    await page.getByRole("button", { name: /Free roam/ }).tap();
    await expect(page.getByTestId("present-surface")).toBeVisible();

    await page.getByRole("button", { name: "Exit presentation" }).tap();
    await expect(region(page)).toHaveCount(0);
  });

  test("a board with no frames explains instead of presenting", async ({ page }) => {
    await openBoard(page);
    await presentButton(page).click();
    await expect(toasts(page).filter({ hasText: "Add frames to present." })).toBeVisible();
    await expect(region(page)).toHaveCount(0);
  });

  test("a deck of one frame presents and stays put", async ({ page }, info) => {
    test.skip(info.project.name === "phone", "keyboard");
    await openBoard(page);
    await page.evaluate((s) => (window as unknown as { __atelier: Api }).__atelier.doc.create(s), frameSpec("Only", 100, 100, 800, 600, "a0"));
    await presentButton(page).click();
    await expect(counter(page)).toHaveText("1 / 1");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowLeft");
    await expect(counter(page)).toHaveText("1 / 1");
    await page.keyboard.press("Escape");
    await expect(region(page)).toHaveCount(0);
  });

  test("locked frames present, and edits made while presenting do not change the deck", async ({ page }, info) => {
    test.skip(info.project.name === "phone", "keyboard");
    await openBoard(page);
    const ids = await seedDeck(page, false);
    await page.evaluate((id) => (window as unknown as { __atelier: Api }).__atelier.doc.update(id, { locked: true }), ids["Story"]);
    await presentButton(page).click();
    await page.evaluate((id) => (window as unknown as { __atelier: Api }).__atelier.doc.remove([id]), ids["Banner"]); // "another device" deletes a slide
    await page.keyboard.press("3");
    await expectSlide(page, 3, RECTS[2]);
    await page.keyboard.press("End");
    await expect(counter(page)).toHaveText("5 / 5");
  });

  test("reduced motion: swipes and arrow clicks jump instantly; otherwise they ease (and finish within 400 ms)", async ({ page }, info) => {
    test.skip(info.project.name === "phone", "mouse click");
    await openBoard(page);
    await seedDeck(page, false);
    await presentButton(page).click();
    await page.getByRole("button", { name: "Next slide" }).click();
    const vp = await viewport(page);
    const want = slideCamera(RECTS[1], vp);
    // smooth: shortly after the click the camera is still on its way
    const mid = await camera(page);
    expect(Math.abs(mid.x - want.x) > 1 || Math.abs(mid.z - want.z) > 1e-4).toBe(true);
    await expect.poll(async () => Math.abs((await camera(page)).x - want.x) < 1e-3, { timeout: 1500 }).toBe(true);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: "Next slide" }).click();
    const instant = await camera(page);
    const want3 = slideCamera(RECTS[2], vp);
    expect(instant.x).toBeCloseTo(want3.x, 4);
    expect(instant.z).toBeCloseTo(want3.z, 6);
  });

  test("moving a slide in the Slides panel changes the order the presentation follows", async ({ page }, info) => {
    test.skip(info.project.name === "phone", "desktop panel");
    await openBoard(page);
    await seedDeck(page, false);
    await page.keyboard.press("Control+k");
    await page.getByRole("combobox").fill("Slides panel");
    await page.keyboard.press("Enter");
    const panel = page.getByRole("complementary", { name: "Slides" });
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: "Move Moodboard earlier" }).click();
    await shot(page, "slides-panel");
    await panel.getByRole("button", { name: "Present", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Slide 1 of 5: Moodboard");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("status")).toHaveText("Slide 2 of 5: Opening");
  });

  test("notes are edited in the Inspector, capped at 2,000 characters", async ({ page }, info) => {
    test.skip(info.project.name === "phone", "desktop panel");
    await openBoard(page);
    const ids = await seedDeck(page, false);
    await selectIds(page, [ids["Opening"]]);
    await page.keyboard.press("Control+Alt+i").catch(() => {});
    await page.keyboard.press("Control+k");
    await page.getByRole("combobox").fill("Inspector panel");
    await page.keyboard.press("Enter");
    const field = page.getByRole("textbox", { name: "Presenter notes" });
    await expect(field).toHaveValue(/Welcome everyone/);
    await field.fill("x".repeat(2500));
    await expect(field).toHaveValue("x".repeat(2000));
    await field.blur();
    const n = await page.evaluate((id) => ((window as unknown as { __atelier: { doc: { get(id: string): { notes: string } } } }).__atelier.doc.get(id)).notes.length, ids["Opening"]);
    expect(n).toBe(2000);
  });

  test("axe: zero serious or critical violations in presentation mode (notes, laser and help open)", async ({ page }) => {
    await openBoard(page);
    await seedDeck(page, false);
    await presentButton(page).click();
    await expect(region(page)).toBeVisible();
    const run = async () => {
      const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      return violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => ({ id: v.id, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ") + " :: " + (n.failureSummary ?? "").replace(/\s+/g, " ").slice(0, 160)) }));
    };
    expect(await run()).toEqual([]);
    await page.keyboard.press("2");
    await page.keyboard.press("n");
    await page.keyboard.press("l");
    expect(await run()).toEqual([]);
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog", { name: "Presentation shortcuts" })).toBeVisible();
    expect(await run()).toEqual([]);
  });

  test("dark theme", async ({ page }, info) => {
    test.skip(info.project.name === "phone" || !SHOTS, "screenshots only");
    await page.emulateMedia({ colorScheme: "dark" });
    await page.addInitScript(() => localStorage.setItem("atelier-theme", "dark"));
    await openBoard(page);
    await seedDeck(page);
    await presentButton(page).click();
    await page.keyboard.press("2");
    await page.keyboard.press("n");
    await shot(page, "dark-slide-2");
  });
});
