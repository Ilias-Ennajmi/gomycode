import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Download, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openBoard, objects, pasteData, placeWith, selectIds } from "./helpers";

/*
 * Export on a real page: a board with frames, a sticky, text, shapes, an arrow, and six generated pictures (one 4000 x 3000,
 * one cropped and masked to a circle, one grey) is exported through the dialog. Downloads are captured with Playwright's
 * download events. Set EXPORT_OUT=<dir> to keep the files for a look.
 */

const OUT = process.env.EXPORT_OUT;

type Api = { doc: { create(o: object): string; update(id: string, p: object): void; all(): { id: string; type: string; name?: string }[] }; uploader: { add(f: File, at: { x: number; y: number }): Promise<string> } };

const frameSpec = (name: string, x: number, y: number, w: number, h: number, order: string, extra: object = {}) => ({
  type: "frame", x, y, w, h, rotation: 0, parentId: null, locked: false, opacity: 1, name, preset: "custom", background: null, clip: true, order, notes: "", ...extra,
});

/** Make a picture with enough detail (stripes, discs, a label) that crops, masks and softness show. */
async function addPicture(page: Page, label: string, w: number, h: number, hue: number, patch: object): Promise<string> {
  return page.evaluate(
    async ({ label, w, h, hue, patch }) => {
      const c = new OffscreenCanvas(w, h);
      const g = c.getContext("2d")!;
      const grad = g.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, `hsl(${hue} 70% 55%)`);
      grad.addColorStop(1, `hsl(${(hue + 60) % 360} 60% 35%)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "rgba(255,255,255,.35)";
      g.lineWidth = Math.max(2, w / 200);
      for (let x = -h; x < w; x += w / 16) {
        g.beginPath();
        g.moveTo(x, h);
        g.lineTo(x + h, 0);
        g.stroke();
      }
      g.fillStyle = "rgba(255,255,255,.8)";
      g.beginPath();
      g.arc(w * 0.3, h * 0.35, Math.min(w, h) * 0.18, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(20,20,20,.85)";
      g.fillRect(w * 0.55, h * 0.5, w * 0.3, h * 0.3);
      g.fillStyle = "#fff";
      g.font = `bold ${Math.round(w / 12)}px sans-serif`;
      g.fillText(label, w * 0.06, h * 0.9);
      const blob = await c.convertToBlob({ type: "image/png" });
      const api = (window as unknown as { __atelier: Api }).__atelier;
      const id = await api.uploader.add(new File([blob], `${label}.png`, { type: "image/png" }), { x: 0, y: 0 });
      api.doc.update(id, patch);
      return id;
    },
    { label, w, h, hue, patch },
  );
}

async function buildBoard(page: Page): Promise<{ frames: Record<string, string> }> {
  const ids = await page.evaluate(
    ({ frames }) => {
      const api = (window as unknown as { __atelier: Api }).__atelier;
      const f = Object.fromEntries(frames.map((s) => [s.name, api.doc.create(s)]));
      const shape = (extra: object) => ({ type: "shape", x: 0, y: 0, w: 120, h: 80, rotation: 0, parentId: null, locked: false, opacity: 1, kind: "rect", fill: null, stroke: "var(--color-ink)", strokeWidth: 2, strokeStyle: "solid", cornerRadius: 0, ...extra });
      const a = api.doc.create(shape({ x: 40, y: 330, w: 140, h: 90, kind: "roundRect", fill: "var(--sticky-peach)", parentId: f["Intro"], cornerRadius: 16 }));
      const b = api.doc.create(shape({ x: 420, y: 340, w: 120, h: 120, kind: "ellipse", fill: "var(--sticky-lilac)", parentId: f["Intro"] }));
      api.doc.create({
        type: "arrow", x: 180, y: 375, w: 240, h: 1, rotation: 0, parentId: f["Intro"], locked: false, opacity: 1,
        start: { kind: "bound", id: a, anchor: { x: 1, y: 0.5 } }, end: { kind: "bound", id: b, anchor: { x: 0, y: 0.5 } },
        route: "curved", startHead: "none", endHead: "triangle", stroke: "var(--color-accent)", strokeWidth: 3, strokeStyle: "solid", label: "next",
      });
      // loose objects outside every frame, one rotated
      api.doc.create(shape({ x: 0, y: 700, w: 200, h: 100, rotation: 0.3, fill: "var(--sticky-mint)", kind: "diamond" }));
      api.doc.create({ type: "swatch", x: 3000, y: 80, w: 140, h: 140, rotation: 0, parentId: f["Notes"], locked: false, opacity: 1, hex: "#2f4a6d", name: "Ink blue", format: "hex" });
      api.doc.create({
        type: "palette", x: 3000, y: 260, w: 460, h: 100, rotation: 0, parentId: f["Notes"], locked: false, opacity: 1,
        swatches: [{ hex: "#2f4a6d", weight: 0.5, name: "Ink", locked: false }, { hex: "#d9774a", weight: 0.3, name: "Clay", locked: false }, { hex: "#bfe6cf", weight: 0.2, name: "Mint", locked: false }],
        maxColors: 8, layout: "strip", showWeights: true, live: false,
      });
      api.doc.create({
        type: "link", x: 3000, y: 400, w: 460, h: 130, rotation: 0, parentId: f["Notes"], locked: false, opacity: 1,
        url: "https://www.example.com/story", title: "A story about colour", description: "Notes on picking a palette from a photograph.", siteName: "Example", imageAssetId: null, status: "ready",
      });
      return f;
    },
    { frames: [frameSpec("Intro", 0, 0, 960, 540, "a0"), frameSpec("Moodboard", 1100, 0, 960, 540, "a1"), frameSpec("Notes", 2200 + 800, 0, 540, 960, "a2")] },
  );
  // pictures (the real upload pipeline: variants, palette, blobs kept on this device)
  await addPicture(page, "ONE 4000x3000", 4000, 3000, 20, { x: 1120, y: 20, w: 420, h: 315, parentId: ids["Moodboard"] });
  await addPicture(page, "TWO round", 1200, 1200, 200, { x: 1560, y: 20, w: 200, h: 200, parentId: ids["Moodboard"], crop: { x: 0.1, y: 0.1, w: 0.6, h: 0.6 }, mask: { kind: "circle", radius: 0 } });
  await addPicture(page, "THREE grey", 1000, 700, 330, { x: 1560, y: 240, w: 300, h: 210, parentId: ids["Moodboard"], grayscale: true });
  await addPicture(page, "FOUR flip", 800, 600, 100, { x: 1120, y: 360, w: 200, h: 150, parentId: ids["Moodboard"], flipX: true });
  await addPicture(page, "FIVE rounded", 900, 600, 280, { x: 1340, y: 360, w: 200, h: 133, parentId: ids["Moodboard"], mask: { kind: "rounded", radius: 24 }, rotation: -0.12 });
  await addPicture(page, "SIX loose", 2000, 1500, 50, { x: 300, y: 700, w: 260, h: 195 });
  return { frames: ids };
}

/** Fill the sticky and text objects through the editor so their content is real rich text. */
async function addTexts(page: Page, intro: string): Promise<void> {
  const before = (await objects(page)).length;
  await placeWith(page, "n", { x: -700, y: 0 });
  const all = await objects(page);
  const sticky = all.find((o) => o.type === "sticky" && !o.parentId) ?? all[all.length - 1];
  await page.keyboard.type("Hello sticky: the quick brown fox jumps over the lazy dog");
  await page.keyboard.press("Escape");
  await page.evaluate(({ id, intro }) => (window as unknown as { __atelier: Api }).__atelier.doc.update(id, { x: 40, y: 40, w: 260, h: 200, parentId: intro, fill: "mint" }), { id: sticky.id, intro });
  // plain text pasted onto the canvas becomes a text object
  await pasteData(page, { text: "Spring campaign 2027" });
  const text = (await objects(page)).filter((o) => o.type === "text").at(-1)!;
  await page.evaluate(({ id, intro }) => (window as unknown as { __atelier: Api }).__atelier.doc.update(id, { x: 330, y: 60, fontSize: 44, parentId: intro }), { id: text.id, intro });
  expect((await objects(page)).length).toBeGreaterThan(before);
}

async function openDialog(page: Page) {
  await page.getByRole("button", { name: "Export" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Export" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function runExport(page: Page, dialog: ReturnType<Page["getByRole"]>): Promise<Download> {
  const dl = page.waitForEvent("download", { timeout: 60_000 });
  await dialog.getByRole("button", { name: "Export", exact: true }).click();
  return dl;
}

async function save(d: Download): Promise<Buffer> {
  const path = await d.path();
  const bytes = readFileSync(path);
  if (OUT) {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, d.suggestedFilename()), bytes);
  }
  return bytes;
}

const png = (b: Buffer) => ({ ok: b.subarray(1, 4).toString() === "PNG", w: b.readUInt32BE(16), h: b.readUInt32BE(20) });

test.describe("export", () => {
  test.setTimeout(240_000);

  test("PNG of a frame and of the board, SVG, with a labelled progress bar and a summary", async ({ page, browserName }, info) => {
    void browserName;
    if (info.project.name !== "desktop") test.skip();
    await openBoard(page, undefined, { zoom: 0.4 });
    const { frames } = await buildBoard(page);
    await addTexts(page, frames["Intro"]);
    await selectIds(page, []);

    // a frame at 1x: exactly the frame's size
    let dialog = await openDialog(page);
    await dialog.getByRole("radio", { name: "Frame" }).check({ force: true });
    await dialog.getByRole("combobox", { name: "Frame" }).selectOption({ label: "Intro" });
    await expect(dialog.locator("[data-export-size]")).toContainText("960 × 540 px");
    let d = await runExport(page, dialog);
    let bytes = await save(d);
    expect(d.suggestedFilename()).toMatch(/Intro\.png$/);
    expect(png(bytes)).toEqual({ ok: true, w: 960, h: 540 });
    await expect(dialog.locator("[data-export-summary]")).toContainText("Saved");
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toHaveCount(0);

    // the Moodboard frame at 2x
    dialog = await openDialog(page);
    await dialog.getByRole("radio", { name: "Frame" }).check({ force: true });
    await dialog.getByRole("combobox", { name: "Frame" }).selectOption({ label: "Moodboard" });
    await dialog.getByRole("radio", { name: "2×" }).check({ force: true });
    d = await runExport(page, dialog);
    bytes = await save(d);
    expect(d.suggestedFilename()).toMatch(/Moodboard@2x\.png$/);
    expect(png(bytes)).toEqual({ ok: true, w: 1920, h: 1080 });
    await dialog.getByRole("button", { name: "Close" }).click();

    // the whole board as PNG at 1x: size follows the preview
    dialog = await openDialog(page);
    const text = await dialog.locator("[data-export-size]").innerText();
    const m = /Output: ([\d,]+) × ([\d,]+) px/.exec(text)!;
    d = await runExport(page, dialog);
    bytes = await save(d);
    expect(png(bytes)).toEqual({ ok: true, w: Number(m[1].replace(/,/g, "")), h: Number(m[2].replace(/,/g, "")) });
    await dialog.getByRole("button", { name: "Close" }).click();

    // SVG of the board: well-formed, real text, embedded pictures
    dialog = await openDialog(page);
    await dialog.getByRole("radio", { name: "SVG" }).check({ force: true });
    d = await runExport(page, dialog);
    bytes = await save(d);
    const svg = bytes.toString("utf8");
    const ok = await page.evaluate((s) => {
      const doc = new DOMParser().parseFromString(s, "application/xml");
      return { error: doc.getElementsByTagName("parsererror").length, texts: [...doc.getElementsByTagName("text")].map((t) => t.textContent).join(" "), images: doc.getElementsByTagName("image").length, scripts: doc.getElementsByTagName("script").length };
    }, svg);
    expect(ok.error).toBe(0);
    expect(ok.scripts).toBe(0);
    expect(ok.texts).toContain("Spring");
    expect(ok.images).toBeGreaterThanOrEqual(6);
    expect(svg).toContain("data:image/");
  });

  test("a PDF deck: one page per frame in presentation order, with cover and palette pages", async ({ page }, info) => {
    if (info.project.name !== "desktop") test.skip();
    await openBoard(page, undefined, { zoom: 0.4 });
    const { frames } = await buildBoard(page);
    await addTexts(page, frames["Intro"]);
    await selectIds(page, []);
    const dialog = await openDialog(page);
    await dialog.getByRole("radio", { name: "PDF" }).check({ force: true });
    await expect(dialog.locator("[data-export-size]")).toContainText("3 pages");
    await dialog.getByRole("checkbox", { name: "Cover page" }).check();
    await dialog.getByRole("checkbox", { name: "Palette page" }).check();
    await expect(dialog.locator("[data-export-size]")).toContainText("5 pages");
    const d = await runExport(page, dialog);
    const bytes = await save(d);
    const pdf = bytes.toString("latin1");
    expect(d.suggestedFilename()).toMatch(/\.pdf$/);
    expect(pdf.startsWith("%PDF-")).toBe(true);
    expect((pdf.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length).toBe(5);
    expect(pdf).toContain("/FontFile2");
    await expect(dialog.locator("[data-export-summary]")).toContainText("Saved");
  });

  test("the dialog is keyboard operable and has no accessibility violations; Escape closes it", async ({ page }, info) => {
    if (info.project.name !== "desktop") test.skip();
    await openBoard(page, undefined, { zoom: 0.4 });
    await buildBoard(page);
    await page.keyboard.press("Control+Shift+E");
    const dialog = page.getByRole("dialog", { name: "Export" });
    await expect(dialog).toBeVisible();
    const results = await new AxeBuilder({ page }).include("dialog").analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    // focus stays inside the dialog while tabbing
    for (let i = 0; i < 25; i++) await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("dialog"))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("cancel stops a running export and returns to the form", async ({ page }, info) => {
    if (info.project.name !== "desktop") test.skip();
    // Hold the worker's start message back so the export is still running when Cancel is pressed.
    await page.addInitScript(() => {
      const post = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (this: Worker, m: unknown, ...rest: unknown[]) {
        if (m && typeof m === "object" && (m as { type?: string }).type === "start") {
          setTimeout(() => (post as (...a: unknown[]) => void).call(this, m, ...rest), 4000);
          return;
        }
        return (post as (...a: unknown[]) => void).call(this, m, ...rest);
      } as typeof Worker.prototype.postMessage;
    });
    await openBoard(page, undefined, { zoom: 0.4 });
    await buildBoard(page);
    const dialog = await openDialog(page);
    await dialog.getByRole("radio", { name: "4×" }).check({ force: true });
    await dialog.getByRole("button", { name: "Export", exact: true }).click();
    const cancel = dialog.getByRole("button", { name: "Cancel export" });
    await expect(dialog.getByRole("progressbar", { name: "Export progress" })).toBeVisible();
    await cancel.click();
    await expect(dialog.getByRole("progressbar")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Export", exact: true })).toBeEnabled();
  });
});
