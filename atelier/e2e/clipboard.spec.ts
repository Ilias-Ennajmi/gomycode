import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  MOD,
  type FileSpec,
  dropData,
  expectCount,
  getObject,
  objects,
  objectsOfType,
  openBoard,
  pasteData,
  selectIds,
  selectedIds,
  textOf,
  toasts,
} from "./helpers";

const fixture = (name: string, type = "image/png"): FileSpec => ({ name, type, base64: readFileSync(join(__dirname, "fixtures", name)).toString("base64") });

/** Two shapes joined by a bound arrow, made through the document so the test is about the clipboard, not about drawing. */
async function seedConnected(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const { doc } = (window as unknown as { __atelier: { doc: { create(o: unknown): string } } }).__atelier;
    const base = { type: "shape", kind: "rect", rotation: 0, parentId: null, locked: false, opacity: 1, fill: null, stroke: "#222", strokeWidth: 2, strokeStyle: "solid", cornerRadius: 0, w: 120, h: 80 };
    const a = doc.create({ ...base, x: -300, y: -40 });
    const b = doc.create({ ...base, x: 100, y: -40 });
    const arrow = doc.create({
      type: "arrow", x: -180, y: 0, w: 280, h: 1, rotation: 0, parentId: null, locked: false, opacity: 1,
      start: { kind: "bound", id: a, anchor: { x: 1, y: 0.5 } },
      end: { kind: "bound", id: b, anchor: { x: 0, y: 0.5 } },
      route: "straight", startHead: "none", endHead: "arrow", stroke: "#222", strokeWidth: 2, strokeStyle: "solid", label: "",
    });
    return { a, b, arrow };
  });
}

test.describe("clipboard", () => {
  test("copy and paste duplicates objects, and a pasted arrow stays bound to the pasted shapes", async ({ page }) => {
    await openBoard(page);
    const { a, b, arrow } = await seedConnected(page);
    await page.locator("#board-canvas").focus();
    await page.keyboard.press(`${MOD}+a`);
    await expect.poll(() => selectedIds(page).then((s) => s.length)).toBe(3);
    await page.keyboard.press(`${MOD}+c`);
    await expect(toasts(page).filter({ hasText: "Copied 3 objects" })).toBeVisible();
    await page.keyboard.press(`${MOD}+v`);

    await expectCount(page, 6);
    const all = await objects(page);
    const fresh = all.filter((o) => ![a, b, arrow].includes(o.id));
    const freshShapes = fresh.filter((o) => o.type === "shape").map((o) => o.id);
    const [copy] = fresh.filter((o) => o.type === "arrow");
    expect(freshShapes).toHaveLength(2);
    // The copy is bound to the copied shapes, not to the originals.
    expect([(copy.start as { id: string }).id, (copy.end as { id: string }).id].sort()).toEqual([...freshShapes].sort());
    // The original arrow is untouched.
    const original = (await getObject(page, arrow))!;
    expect(original.start).toMatchObject({ kind: "bound", id: a });
    expect(original.end).toMatchObject({ kind: "bound", id: b });
    // The pasted objects are the selection.
    await expect.poll(async () => (await selectedIds(page)).sort()).toEqual(fresh.map((o) => o.id).sort());
  });

  test("cut removes the objects and pasting brings them back", async ({ page }) => {
    await openBoard(page);
    const { a } = await seedConnected(page);
    await selectIds(page, [a]);
    await page.locator("#board-canvas").focus();
    await page.keyboard.press(`${MOD}+x`);
    await expect.poll(async () => (await getObject(page, a)) === undefined).toBe(true);
    await page.keyboard.press(`${MOD}+v`);
    await expect.poll(async () => (await objectsOfType(page, "shape")).length).toBe(2);
  });

  test("pasting 500 lines asks to split into stickies, and splitting works", async ({ page }) => {
    await openBoard(page);
    const lines = Array.from({ length: 500 }, (_, i) => `Idea number ${i + 1}`);
    await pasteData(page, { text: lines.join("\n") });

    const [text] = await expectCount(page, 1, "text");
    await expect.poll(() => textOf(page, text.id).then((t) => t.includes("Idea number 500"))).toBe(true);
    const prompt = toasts(page).filter({ hasText: "Pasted 500 lines as one text object" });
    await expect(prompt).toBeVisible();
    await prompt.getByRole("button", { name: "Split into 500 stickies?" }).click();

    const stickies = await expectCount(page, 500, "sticky");
    expect(await objectsOfType(page, "text")).toHaveLength(0);
    expect(new Set(stickies.map((s) => `${s.x},${s.y}`)).size).toBe(500); // laid out in a grid, none on top of another
    const first = stickies.find((s) => s.x === Math.min(...stickies.map((t) => t.x)) && s.y === Math.min(...stickies.map((t) => t.y)))!;
    await expect.poll(() => textOf(page, first.id)).toBe("Idea number 1");

    // One undo puts the single text object back.
    await page.locator("#board-canvas").focus();
    await page.keyboard.press(`${MOD}+z`);
    await expectCount(page, 1, "text");
  });

  test("a short pasted list also offers stickies, and ignoring the prompt keeps one text object", async ({ page }) => {
    await openBoard(page);
    await pasteData(page, { text: "red\ngreen\nblue\nyellow" });
    await expectCount(page, 1, "text");
    await expect(toasts(page).getByRole("button", { name: "Split into 4 stickies?" })).toBeVisible();
    expect(await objectsOfType(page, "sticky")).toHaveLength(0);
  });

  test("dropping two images lays them out as a grid of image objects", async ({ page }) => {
    await openBoard(page);
    await dropData(page, { files: [fixture("swatch-a.png"), fixture("swatch-b.png")] });
    const images = await expectCount(page, 2, "image");
    expect(images[0].w).toBeGreaterThan(0);
    // Side by side, not stacked on one point.
    const [p, q] = images;
    const overlap = p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
    expect(overlap).toBe(false);
    // Each has an image element on the canvas.
    for (const im of images) await expect(page.locator(`[data-object-id="${im.id}"]`)).toBeAttached();
    expect(await toasts(page).count()).toBe(0);
  });

  test("pasting two image files does the same", async ({ page }) => {
    await openBoard(page);
    await pasteData(page, { files: [fixture("swatch-a.png"), fixture("swatch-b.png")] });
    await expectCount(page, 2, "image");
  });

  test("an unsupported, an oversize, an empty and an undecodable file each get a toast naming the file, and nothing is inserted", async ({ page }) => {
    await openBoard(page);
    const cases: Array<{ file: FileSpec; reason: RegExp }> = [
      { file: { name: "notes.txt", type: "text/plain", base64: Buffer.from("just words").toString("base64") }, reason: /only images can be added/ },
      { file: { name: "huge-scan.png", type: "image/png", size: 60 * 1024 * 1024 }, reason: /too large/i },
      { file: { name: "empty.png", type: "image/png", size: 0 }, reason: /empty/i },
      // Chromium cannot decode HEIC: the pipeline reports an unsupported format.
      { file: { name: "holiday.heic", type: "image/heic", base64: Buffer.from("not really a heic file").toString("base64") }, reason: /unsupported/i },
    ];
    // One file at a time: the toast region keeps only the newest three.
    for (const { file, reason } of cases) {
      await test.step(file.name, async () => {
        await dropData(page, { files: [file] });
        const toast = toasts(page).filter({ hasText: file.name });
        await expect(toast).toHaveCount(1);
        await expect(toast).toContainText(`Couldn't add ${file.name}`);
        await expect(toast).toContainText(reason);
        expect(await objects(page)).toHaveLength(0);
        await toast.getByRole("button", { name: "Dismiss" }).click();
        await expect(toasts(page)).toHaveCount(0);
      });
    }
  });

  test("a good image next to a bad one is still added, and only the bad one is reported", async ({ page }) => {
    await openBoard(page);
    await dropData(page, { files: [fixture("swatch-a.png"), { name: "notes.txt", type: "text/plain", base64: "aGk=" }] });
    await expectCount(page, 1, "image");
    await expect(toasts(page).filter({ hasText: "notes.txt" })).toHaveCount(1);
  });

  test("an undecodable image pasted from another app is reported by name", async ({ page }) => {
    await openBoard(page);
    await pasteData(page, { files: [{ name: "holiday.heic", type: "image/heic", base64: Buffer.from("not really a heic file").toString("base64") }] });
    await expect(toasts(page).filter({ hasText: "holiday.heic" })).toContainText(/unsupported/i);
    expect(await objects(page)).toHaveLength(0);
  });

  test("a malformed Atelier payload on the clipboard does not crash the editor", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await openBoard(page);

    const wrap = (b64: string) => `<meta charset="utf-8"><!-- atelier:v1 ${b64} --><span>hello</span>`;
    const garbage = [
      wrap("%%%not-base64%%%"),
      wrap(Buffer.from("{ this is not json").toString("base64")),
      wrap(Buffer.from(JSON.stringify({ v: 1, objects: [{ type: "sticky", x: "NaN", w: -5 }, null, 7] })).toString("base64")),
      wrap(Buffer.from(JSON.stringify({ v: 99, objects: "nope" })).toString("base64")),
      wrap(""),
    ];
    for (const html of garbage) await pasteData(page, { html });
    await pasteData(page, {}); // an empty clipboard
    await pasteData(page, { text: "   \n  " });

    // Still alive: the canvas responds, and a normal paste afterwards works.
    await pasteData(page, { text: "still works" });
    await expect.poll(async () => (await objectsOfType(page, "text")).length).toBeGreaterThanOrEqual(1);
    await expect(page.locator("#board-canvas")).toBeVisible();
    expect(errors).toEqual([]);
    // Nothing invalid reached the document.
    for (const o of await objects(page)) {
      for (const k of ["x", "y", "w", "h"] as const) expect(Number.isFinite(o[k])).toBe(true);
      expect(o.w).toBeGreaterThan(0);
    }
  });
});
