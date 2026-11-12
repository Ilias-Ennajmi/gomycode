import { describe, expect, it } from "vitest";
import { clampScale, MAX_CANVAS_AREA, MAX_CANVAS_SIDE, renderRaster, type ImageProvider } from "@/lib/engine/export/raster";
import type { Scene, SceneNode } from "@/lib/engine/export/scene";
import { fakeBitmap, fakeCanvasFactory, recordingContext, type Call } from "./helpers/fake-canvas";

const paint = { fill: "#112233", stroke: null, strokeWidth: 0, dash: null, opacity: 1 };
const rect = (fill: string, x = 0, clip: SceneNode["clip"] = null): SceneNode => ({ kind: "rect", sourceId: fill, clip, x, y: 0, w: 10, h: 10, rotation: 0, radius: 0, ...paint, fill });
const image = (assetId: string, extra: Partial<Extract<SceneNode, { kind: "image" }>> = {}): SceneNode => ({
  kind: "image", sourceId: assetId, clip: null, assetId, x: 0, y: 0, w: 50, h: 50, rotation: 0, crop: null, rx: 0, ry: 0, flipX: false, flipY: false, grayscale: false, opacity: 1, ...extra,
});
const scene = (nodes: SceneNode[], extra: Partial<Scene> = {}): Scene => ({ width: 200, height: 100, origin: { x: 0, y: 0 }, background: null, nodes, assetIds: [], fonts: [], warnings: [], ...extra });
const opts = { scale: 1, format: "png" as const, quality: 0.92, transparent: false };
const okImages: ImageProvider = { load: async () => fakeBitmap() };
const fills = (log: Call[]) => log.filter((c) => c[0] === "set:fillStyle").map((c) => c[1]);

function deps(over: Partial<Parameters<typeof renderRaster>[2]> = {}) {
  const { ctx, log } = recordingContext();
  const progress: number[] = [];
  const rec = { sizes: [] as [number, number][], blobs: [] as { type?: string; quality?: number }[] };
  return {
    log,
    progress,
    rec,
    d: { images: okImages, signal: new AbortController().signal, onProgress: (r: number) => progress.push(r), canvasFactory: fakeCanvasFactory(ctx, rec), ...over },
  };
}

describe("clampScale", () => {
  it("reduces a 4x export of a 30,000 px board to the canvas limits and says why", () => {
    const r = clampScale({ width: 30000, height: 20000 }, { scale: 4 });
    expect(r.clamped).toBe(true);
    expect(r.width).toBeLessThanOrEqual(MAX_CANVAS_SIDE);
    expect(r.width * r.height).toBeLessThanOrEqual(MAX_CANVAS_AREA);
    expect(r.reason).toContain("16,384");
  });
  it("limits the area when no side is too long", () => {
    const r = clampScale({ width: 16384, height: 16384 }, { scale: 1 });
    expect(r.clamped).toBe(true);
    expect(r.width * r.height).toBeLessThanOrEqual(MAX_CANVAS_AREA);
    expect(r.reason).toMatch(/megapixel/i);
  });
  it("turns an exact width into a scale", () => {
    expect(clampScale({ width: 960, height: 540 }, { widthPx: 1920 })).toMatchObject({ scale: 2, width: 1920, height: 1080, clamped: false });
  });
  it("reads a hostile width as 1x", () => {
    for (const w of [NaN, Infinity, 0, -5]) expect(clampScale({ width: 960, height: 540 }, { widthPx: w }).scale).toBe(1);
    expect(clampScale({ width: 960, height: 540 }, { scale: NaN }).scale).toBe(1);
  });
  it("does not clamp a normal size", () => {
    expect(clampScale({ width: 1000, height: 1000 }, { scale: 2 })).toMatchObject({ scale: 2, width: 2000, height: 2000, clamped: false, reason: undefined });
  });
});

describe("renderRaster", () => {
  it("draws nodes in order", async () => {
    const t = deps();
    await renderRaster(scene([rect("#010101"), rect("#020202"), rect("#030303")]), opts, t.d);
    const order = fills(t.log).filter((f) => ["#010101", "#020202", "#030303"].includes(String(f)));
    expect(order).toEqual(["#010101", "#020202", "#030303"]);
  });

  it("clips a clipped node before drawing it", async () => {
    const t = deps();
    await renderRaster(scene([rect("#0a0a0a", 0, { x: 0, y: 0, w: 5, h: 5 })]), opts, t.d);
    const clipAt = t.log.findIndex((c) => c[0] === "clip");
    const fillAt = t.log.findIndex((c) => c[0] === "set:fillStyle" && c[1] === "#0a0a0a");
    expect(clipAt).toBeGreaterThan(-1);
    expect(clipAt).toBeLessThan(fillAt);
  });

  it("fills a JPEG with the paper colour, and a transparent PNG not at all", async () => {
    const j = deps();
    await renderRaster(scene([]), { ...opts, format: "jpeg" }, j.d);
    expect(fills(j.log)[0]).toBe("#F5F2EC");
    expect(j.log.some((c) => c[0] === "fillRect")).toBe(true);
    expect(j.rec.blobs[0].type).toBe("image/jpeg");
    const p = deps();
    await renderRaster(scene([rect("#111111")]), { ...opts, transparent: true }, p.d);
    expect(p.log.some((c) => c[0] === "fillRect")).toBe(false);
    // a scene background is used when it has one
    const b = deps();
    await renderRaster(scene([], { background: "#abcdef" }), opts, b.d);
    expect(fills(b.log)[0]).toBe("#abcdef");
    // JPEG cannot be transparent even when asked
    const j2 = deps();
    await renderRaster(scene([]), { ...opts, format: "jpeg", transparent: true }, j2.d);
    expect(j2.log.some((c) => c[0] === "fillRect")).toBe(true);
  });

  it("scales to the requested size and reports the output size", async () => {
    const t = deps();
    const r = await renderRaster(scene([rect("#111111")]), { ...opts, scale: 2 }, t.d);
    expect([r.width, r.height]).toEqual([400, 200]);
    expect(t.rec.sizes[0]).toEqual([400, 200]);
    expect(r.blob.type).toBe("image/png");
  });

  it("clips a masked image to its rounded or elliptical outline", async () => {
    const t = deps();
    await renderRaster(scene([image("a", { rx: 25, ry: 25 })], { assetIds: ["a"] }), opts, t.d);
    const clips = t.log.filter((c) => c[0] === "clip").length;
    expect(clips).toBeGreaterThanOrEqual(1);
    expect(t.log.some((c) => c[0] === "drawImage")).toBe(true);
  });

  it("applies flip and crop when drawing an image", async () => {
    const t = deps();
    await renderRaster(scene([image("a", { flipX: true, crop: { x: 0.25, y: 0, w: 0.5, h: 1 } })]), opts, t.d);
    const draw = t.log.find((c) => c[0] === "drawImage")!;
    // 100 px bitmap; a flipped crop of the displayed middle half is the source middle half
    expect(draw.slice(2, 6)).toEqual([25, 0, 50, 100]);
    expect(t.log.some((c) => c[0] === "scale" && c[1] === -1)).toBe(true);
  });

  it("uses a placeholder for an image that failed to load and still resolves", async () => {
    const t = deps({ images: { load: async () => null } });
    const r = await renderRaster(scene([image("gone"), rect("#050505")], { assetIds: ["gone"] }), opts, t.d);
    expect(r.failedAssets).toEqual(["gone"]);
    expect(t.log.some((c) => c[0] === "drawImage")).toBe(false);
    expect(fills(t.log)).toContain("#050505");
    expect(t.log.some((c) => c[0] === "fill" || c[0] === "fillRect")).toBe(true); // the placeholder
  });

  it("does not let a provider that throws break the export", async () => {
    const t = deps({ images: { load: async () => { throw new Error("boom"); } } });
    const r = await renderRaster(scene([image("x")]), opts, t.d);
    expect(r.failedAssets).toEqual(["x"]);
  });

  it("stops with AbortError and draws nothing more after the signal aborts", async () => {
    const ac = new AbortController();
    let n = 0;
    const t = deps({ signal: ac.signal, images: { load: async () => fakeBitmap() } });
    const many = Array.from({ length: 10 }, (_, i) => rect(`#0${i}0${i}0${i}`));
    const original = t.d.onProgress;
    t.d.onProgress = (r, l) => original(r, l);
    // abort when the third rect's fillStyle is set: the context is the observation point
    const { ctx, log } = recordingContext();
    const hooked = new Proxy(ctx, {
      set(target, name: string, value) {
        if (name === "fillStyle" && /^#0\d0\d0\d$/.test(String(value)) && ++n === 3) ac.abort();
        return Reflect.set(target, name, value);
      },
    });
    const d = { ...t.d, canvasFactory: fakeCanvasFactory(hooked) };
    await expect(renderRaster(scene(many), opts, d)).rejects.toMatchObject({ name: "AbortError" });
    const drawn = log.filter((c) => c[0] === "set:fillStyle" && /^#0\d0\d0\d$/.test(String(c[1]))).length;
    expect(drawn).toBeLessThanOrEqual(3);
  });

  it("reports monotonic progress ending at 1", async () => {
    const t = deps();
    const nodes = Array.from({ length: 60 }, (_, i) => rect("#111111", i));
    await renderRaster(scene(nodes), opts, t.d);
    for (let i = 1; i < t.progress.length; i++) expect(t.progress[i]).toBeGreaterThanOrEqual(t.progress[i - 1]);
    expect(t.progress[t.progress.length - 1]).toBe(1);
    expect(t.progress.length).toBeGreaterThan(2);
  });

  it("does not throw for an empty zero-size scene", async () => {
    const t = deps();
    const r = await renderRaster(scene([], { width: 0, height: 0 }), opts, t.d);
    expect([r.width, r.height]).toEqual([1, 1]);
  });

  it("draws text runs at their positions with the export font", async () => {
    const t = deps();
    const node: SceneNode = {
      kind: "text", sourceId: "t", clip: null, x: 10, y: 20, w: 100, h: 30, rotation: 0, cx: 60, cy: 35, color: "#123456", opacity: 1,
      lines: [{ x: 0, y: 18, width: 40, runs: [{ text: "Hello", marks: ["underline"], x: 0, width: 40, font: { family: "Inter", weight: 600, italic: false, size: 20 } }] }],
    };
    await renderRaster(scene([node]), opts, t.d);
    const text = t.log.find((c) => c[0] === "fillText")!;
    expect(text.slice(1)).toEqual(["Hello", 10, 38]);
    expect(t.log.find((c) => c[0] === "set:font")![1]).toBe('600 20px "AtelierExport Inter", sans-serif');
    expect(fills(t.log)).toContain("#123456");
  });
});
