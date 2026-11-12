import { expect, test, type Page } from "@playwright/test";
import { openBoard, objectsOfType } from "./helpers";

/*
 * The image layer on a real page: images added through the real upload path (a drop), drawn with the right variant for
 * the zoom, sharper when zoomed in, lighter when zoomed out. The source images are made in the page (a canvas), so no
 * big files are committed.
 */

type Api = { canvas: { viewport(): { w: number; h: number }; setCamera(c: object): void; images: { stats(): { mounted: number; residentBytes: number; variantCounts: Record<string, number> } } }; doc: { get(id: string): { x: number; y: number; w: number; h: number } | undefined } };

/** Drop one detailed PNG of the given size (grid lines and fine text, so softness shows). */
async function dropImage(page: Page, name: string, w: number, h: number): Promise<void> {
  await page.evaluate(
    async ({ name, w, h }) => {
      const c = new OffscreenCanvas(w, h);
      const g = c.getContext("2d")!;
      const grad = g.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, "#d9774a");
      grad.addColorStop(1, "#3c6e8f");
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "#fff";
      for (let x = 0; x < w; x += 40) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, h);
        g.stroke();
      }
      g.fillStyle = "#111";
      g.font = `${Math.round(w / 40)}px sans-serif`;
      g.fillText(`${name} ${w}x${h}`, 20, h / 2);
      const blob = await c.convertToBlob({ type: "image/png" });
      const dt = new DataTransfer();
      dt.items.add(new File([blob], `${name}.png`, { type: "image/png" }));
      const el = document.querySelector("#board-canvas")!;
      const r = el.getBoundingClientRect();
      const init = { dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      el.dispatchEvent(new DragEvent("dragenter", init));
      el.dispatchEvent(new DragEvent("dragover", init));
      el.dispatchEvent(new DragEvent("drop", init));
    },
    { name, w, h },
  );
}

/** Frame the object so it is `px` CSS px wide, and wait for the layer to settle on it. */
async function showAt(page: Page, id: string, px: number): Promise<void> {
  await page.evaluate(
    ({ id, px }) => {
      const { canvas, doc } = (window as unknown as { __atelier: Api }).__atelier;
      const o = doc.get(id)!;
      const vp = canvas.viewport();
      const z = px / o.w;
      canvas.setCamera({ x: o.x + o.w / 2 - vp.w / 2 / z, y: o.y + o.h / 2 - vp.h / 2 / z, z });
    },
    { id, px },
  );
}

const variantOf = (page: Page, id: string) => page.locator(`[data-object-id="${id}"] img`).getAttribute("data-variant");

test.describe("image layer", () => {
  test("a big image gets sharper as you zoom in and lighter as you zoom out", async ({ page }) => {
    test.setTimeout(90_000);
    await openBoard(page);
    await dropImage(page, "big", 4000, 3000);
    await expect.poll(async () => (await objectsOfType(page, "image")).length).toBe(1);
    const [obj] = await objectsOfType(page, "image");
    const img = page.locator(`[data-object-id="${obj.id}"] img`);
    // The upload pipeline makes w256 / w1024 / w2048 and keeps the original: wait until all of them exist.
    const dpr = await page.evaluate(() => window.devicePixelRatio);

    const ladder: Array<[number, string]> = [
      [100, "w256"],
      [400, "w1024"],
      [1500, "w2048"],
      [2400, "original"],
    ];
    for (const [px, want] of ladder) {
      await showAt(page, obj.id, px / dpr);
      await expect.poll(() => variantOf(page, obj.id), { message: `${px} device px across` }).toBe(want);
      // The bitmap really arrived and is big enough for the pixels on screen.
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThanOrEqual(Math.min(px, 256));
    }
    // And back out: zooming out releases the heavy tiers.
    for (const [px, want] of [...ladder].reverse().slice(1)) {
      await showAt(page, obj.id, px / dpr);
      await expect.poll(() => variantOf(page, obj.id), { message: `${px} device px across, zooming out` }).toBe(want);
    }
  });

  test("a small image has no variants to pick: it shows the original at every zoom", async ({ page }) => {
    await openBoard(page);
    await dropImage(page, "tiny", 200, 150);
    await expect.poll(async () => (await objectsOfType(page, "image")).length).toBe(1);
    const [obj] = await objectsOfType(page, "image");
    for (const px of [40, 200, 800]) {
      await showAt(page, obj.id, px);
      await expect.poll(() => variantOf(page, obj.id)).toBe("original");
    }
  });

  test("only the images in view are mounted and the bitmaps stay under the memory budget", async ({ page }) => {
    await openBoard(page);
    // 60 placeholder-sized image objects far apart: only the ones near the viewport exist as elements.
    await dropImage(page, "seed", 600, 400);
    await expect.poll(async () => (await objectsOfType(page, "image")).length).toBe(1);
    const [seed] = await objectsOfType(page, "image");
    await page.evaluate((src) => {
      const { doc } = (window as unknown as { __atelier: { doc: { create(o: unknown): string; get(id: string): Record<string, unknown> } } }).__atelier;
      const base = doc.get(src);
      for (let i = 1; i <= 60; i++) doc.create({ ...base, id: undefined, index: undefined, x: i * 3000, y: 0 });
    }, seed.id);
    await expect.poll(async () => (await objectsOfType(page, "image")).length).toBe(61);
    await page.evaluate(() => {
      const { canvas } = (window as unknown as { __atelier: Api }).__atelier;
      const vp = canvas.viewport();
      canvas.setCamera({ x: 3000 - vp.w / 2, y: 0, z: 1 });
    });
    await expect.poll(() => page.evaluate(() => (window as unknown as { __atelier: Api }).__atelier.canvas.images.stats().mounted)).toBeLessThan(6);
    const stats = await page.evaluate(() => (window as unknown as { __atelier: Api }).__atelier.canvas.images.stats());
    expect(stats.residentBytes).toBeLessThan(256 * 1024 * 1024);
    expect(await page.locator("[data-image-layer] img").count()).toBe(stats.mounted);
  });
});

test("the benchmark page does not exist unless it is switched on", async ({ request }) => {
  expect((await request.get("/bench")).status()).toBe(404);
});
