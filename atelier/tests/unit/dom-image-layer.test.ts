// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { AssetResolver } from "@/lib/assets/resolver-types";
import type { VariantName } from "@/lib/assets/variants";
import { DomImageLayer } from "@/lib/engine/render/dom-image-layer";
import type { ImageLayerItem } from "@/lib/engine/render/image-layer";
import { ImageResidency } from "@/lib/engine/render/residency";
import { nodeZ } from "@/lib/engine/render/z-order";

type Meta = { variants: VariantName[]; width: number; height: number };
function resolver(meta: Record<string, Meta | null> = {}): AssetResolver & { urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    url: (id, v) => {
      urls.push(`${id}:${v}`);
      return meta[id] === undefined || meta[id] !== null ? `blob:${id}/${v}` : null;
    },
    available: (id) => (id in meta ? meta[id] : { variants: ["w256", "w1024", "w2048"], width: 4000, height: 3000 }),
  };
}
const VIEWPORT = { w: 1000, h: 800 };
const view = (z = 1, dpr = 1) => ({ camera: { x: 0, y: 0, z }, viewport: VIEWPORT, dpr });
const item = (id: string, over: Partial<ImageLayerItem> = {}): ImageLayerItem => ({
  id,
  assetId: id,
  rect: { x: 0, y: 0, w: 200, h: 150 },
  rotation: 0,
  crop: null,
  mask: { kind: "rect", radius: 0 },
  flipX: false,
  flipY: false,
  grayscale: false,
  opacity: 1,
  zIndexKey: "a0",
  caption: null,
  ...over,
});
function setup(deps: Partial<ConstructorParameters<typeof DomImageLayer>[0]> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const r = (deps.resolver as ReturnType<typeof resolver>) ?? resolver();
  const layer = new DomImageLayer({ resolver: r, ...deps });
  layer.mount(container);
  return { layer, container, r };
}
const ids = (c: HTMLElement) => [...c.querySelectorAll("[data-object-id]")].map((e) => e.getAttribute("data-object-id")).sort();
const imgOf = (c: HTMLElement, id: string) => c.querySelector(`[data-object-id="${id}"] img`) as HTMLImageElement;

describe("DomImageLayer", () => {
  it("mounts exactly the items it is given", () => {
    const { layer, container } = setup();
    layer.update([item("a"), item("b"), item("c")], view());
    expect(ids(container)).toEqual(["a", "b", "c"]);
    expect(layer.stats().mounted).toBe(3);
    layer.update([item("b")], view());
    expect(ids(container)).toEqual(["b"]);
    expect(layer.stats().mounted).toBe(1);
  });

  it("gives each image an async-decoded, undraggable <img> tagged with its variant", () => {
    const { layer, container } = setup();
    layer.update([item("a")], view());
    const img = imgOf(container, "a");
    expect(img.getAttribute("decoding")).toBe("async");
    expect(img.getAttribute("draggable")).toBe("false");
    expect(img.hasAttribute("loading")).toBe(false);
    expect(img.getAttribute("data-variant")).toBe("w256"); // 200 px across
    expect(img.getAttribute("data-dimmed")).toBe("false");
    expect(img.getAttribute("src")).toBe("blob:a/w256");
    expect(container.querySelector('[data-object-id="a"]')!.getAttribute("data-object-type")).toBe("image");
  });

  it("returns a removed item's element to the pool and releases its bitmap", () => {
    const { layer, container } = setup();
    layer.update([item("a")], view());
    const img = imgOf(container, "a");
    layer.update([], view());
    expect(ids(container)).toEqual([]);
    expect(img.hasAttribute("src")).toBe(false);
    layer.update([item("z")], view());
    expect(imgOf(container, "z")).toBe(img); // reused, not recreated
    expect(img.getAttribute("src")).toBe("blob:z/w256");
  });

  it("does no DOM writes when nothing changed", () => {
    const { layer, container } = setup();
    const items = [item("a"), item("b", { rect: { x: 300, y: 0, w: 200, h: 150 } })];
    layer.update(items, view());
    const seen: MutationRecord[] = [];
    const mo = new MutationObserver((r) => seen.push(...r));
    mo.observe(container, { attributes: true, childList: true, subtree: true, characterData: true });
    layer.update(items.map((i) => ({ ...i, rect: { ...i.rect } })), view());
    seen.push(...mo.takeRecords());
    mo.disconnect();
    expect(seen).toEqual([]);
  });

  it("changes only the touched element when one item moves", () => {
    const { layer, container } = setup();
    layer.update([item("a"), item("b")], view());
    const mo = new MutationObserver(() => {});
    mo.observe(container, { attributes: true, subtree: true, childList: true });
    layer.update([item("a", { rect: { x: 50, y: 20, w: 200, h: 150 } }), item("b")], view());
    const rec = mo.takeRecords();
    mo.disconnect();
    expect(rec.length).toBeGreaterThan(0);
    for (const r of rec) expect((r.target as HTMLElement).closest("[data-object-id]")!.getAttribute("data-object-id")).toBe("a");
  });

  it("picks the variant for the zoom and dpr, and upgrades when zoomed in", () => {
    const { layer, container } = setup();
    const big = item("a", { rect: { x: 0, y: 0, w: 400, h: 300 } });
    layer.update([big], view(1)); // 400 px -> w1024
    expect(imgOf(container, "a").getAttribute("data-variant")).toBe("w1024");
    layer.update([big], view(4)); // 1600 px -> w2048
    expect(imgOf(container, "a").getAttribute("data-variant")).toBe("w2048");
    layer.update([big], view(8)); // 3200 px -> original
    expect(imgOf(container, "a").getAttribute("data-variant")).toBe("original");
    expect(imgOf(container, "a").getAttribute("src")).toBe("blob:a/original");
    layer.update([big], view(1, 2)); // 800 css px x dpr 2 = 800 -> w1024 (down from original: need far below half)
    expect(imgOf(container, "a").getAttribute("data-variant")).toBe("w1024");
  });

  it("asks for more pixels when the crop shows only part of the source", () => {
    const { layer, container } = setup();
    layer.update([item("a", { rect: { x: 0, y: 0, w: 400, h: 300 }, crop: { x: 0, y: 0, w: 0.25, h: 0.25 } })], view(1));
    expect(imgOf(container, "a").getAttribute("data-variant")).toBe("w2048"); // 400 / 0.25 = 1600
  });

  it("does not change src during a gesture, and applies the new tier after it settles", () => {
    const { layer, container } = setup();
    const big = item("a", { rect: { x: 0, y: 0, w: 400, h: 300 } });
    layer.update([big], view(1));
    layer.setGesture(true);
    layer.update([big], view(0.1)); // would be w256
    expect(imgOf(container, "a").getAttribute("src")).toBe("blob:a/w1024");
    layer.update([big], view(8)); // would be the original
    expect(imgOf(container, "a").getAttribute("src")).toBe("blob:a/w1024");
    layer.setGesture(false);
    layer.update([big], view(8));
    expect(imgOf(container, "a").getAttribute("src")).toBe("blob:a/original");
  });

  it("does not mount new items during a gesture", () => {
    const { layer, container } = setup();
    layer.update([item("a")], view());
    layer.setGesture(true);
    layer.update([item("a"), item("b")], view());
    expect(ids(container)).toEqual(["a"]);
    layer.setGesture(false);
    layer.update([item("a"), item("b")], view());
    expect(ids(container)).toEqual(["a", "b"]);
  });

  it("setCamera writes only the container transform (when it owns it)", () => {
    const { layer, container } = setup();
    layer.update([item("a")], view());
    const wrapper = container.querySelector("[data-object-id]") as HTMLElement;
    const before = wrapper.getAttribute("style");
    layer.setCamera({ x: 100, y: 50, z: 2 });
    expect(container.style.transform).toBe("translate(-200px, -100px) scale(2)");
    expect(wrapper.getAttribute("style")).toBe(before);
  });

  it("leaves the transform alone when the camera layer above already carries it", () => {
    const { layer, container } = setup({ inheritCamera: true });
    layer.setCamera({ x: 100, y: 50, z: 2 });
    expect(container.style.transform).toBe("");
  });

  it("dims everything not listed to 25 % and restores on null", () => {
    const { layer, container } = setup();
    layer.update([item("a"), item("b", { opacity: 0.8 })], view());
    layer.setDimmed(new Set(["a"]));
    const op = (id: string) => (container.querySelector(`[data-object-id="${id}"]`) as HTMLElement).style.opacity;
    expect(op("a")).toBe("");
    expect(Number(op("b"))).toBeCloseTo(0.2, 5); // 0.8 x 0.25
    expect(imgOf(container, "b").getAttribute("data-dimmed")).toBe("true");
    expect(imgOf(container, "a").getAttribute("data-dimmed")).toBe("false");
    layer.setDimmed(null);
    expect(Number(op("b"))).toBeCloseTo(0.8, 5);
    expect(imgOf(container, "b").getAttribute("data-dimmed")).toBe("false");
  });

  it("dims items mounted after setDimmed too", () => {
    const { layer, container } = setup();
    layer.setDimmed(new Set(["a"]));
    layer.update([item("b")], view());
    expect(imgOf(container, "b").getAttribute("data-dimmed")).toBe("true");
  });

  it("shows a quiet placeholder, never a broken image, while the asset has no URL", () => {
    const r = resolver({ missing: null });
    const { layer, container } = setup({ resolver: r });
    layer.update([item("missing")], view());
    const w = container.querySelector('[data-object-id="missing"]') as HTMLElement;
    expect(w).not.toBeNull();
    expect(imgOf(container, "missing").hasAttribute("src")).toBe(false);
    expect(w.hasAttribute("data-placeholder")).toBe(true);
    expect(layer.stats().variantCounts).toEqual({ w256: 0, w1024: 0, w2048: 0, original: 0 });
  });

  it("treats an asset of unknown size as a Phase 1 asset: w1024, then the original", () => {
    const r = resolver({ old: null });
    r.available = () => null;
    r.url = (id, v) => `blob:${id}/${v}`;
    const { layer, container } = setup({ resolver: r });
    layer.update([item("old", { rect: { x: 0, y: 0, w: 300, h: 200 } })], view(1));
    expect(imgOf(container, "old").getAttribute("data-variant")).toBe("w1024");
    layer.update([item("old", { rect: { x: 0, y: 0, w: 300, h: 200 } })], view(5));
    expect(imgOf(container, "old").getAttribute("data-variant")).toBe("original");
  });

  it("flips, greys and rounds without touching the source", () => {
    const { layer, container } = setup();
    layer.update([item("a", { flipX: true, grayscale: true, mask: { kind: "rounded", radius: 12 } }), item("b", { mask: { kind: "circle", radius: 0 } })], view());
    const a = imgOf(container, "a");
    expect(a.style.transform).toBe("scale(-1, 1)");
    expect(a.style.filter).toBe("grayscale(1)");
    expect((container.querySelector('[data-object-id="a"]') as HTMLElement).style.borderRadius).toMatch(/^12px/);
    expect((container.querySelector('[data-object-id="b"]') as HTMLElement).style.borderRadius).toBe("100px / 75px"); // 200 x 150 circle
  });

  it("applies a crop by sizing and offsetting the picture inside the box", () => {
    const { layer, container } = setup();
    layer.update([item("a", { rect: { x: 0, y: 0, w: 200, h: 100 }, crop: { x: 0.25, y: 0.5, w: 0.5, h: 0.5 } })], view());
    const a = imgOf(container, "a");
    expect(a.style.width).toBe("400px");
    expect(a.style.height).toBe("200px");
    expect(a.style.left).toBe("-100px");
    expect(a.style.top).toBe("-100px");
  });

  it("mirrors the crop window with a flip", () => {
    const { layer, container } = setup();
    layer.update([item("a", { rect: { x: 0, y: 0, w: 200, h: 100 }, flipX: true, crop: { x: 0, y: 0, w: 0.5, h: 0.5 } })], view());
    const a = imgOf(container, "a");
    expect(a.style.width).toBe("400px");
    expect(a.style.left).toBe("-200px"); // the window that was on the left of the source is on the right of what is shown
  });

  it("stacks images by z, ties by zIndexKey, and uses the host's z when given", () => {
    const { layer, container } = setup();
    layer.update([item("lo", { zIndexKey: "a0" }), item("hi", { zIndexKey: "a1" }), item("pinned", { zIndexKey: "a0", z: nodeZ("a2") + 1 })], view());
    const z = (id: string) => Number((container.querySelector(`[data-object-id="${id}"]`) as HTMLElement).style.zIndex);
    expect(z("lo")).toBeLessThan(z("hi"));
    expect(z("hi")).toBeLessThan(z("pinned"));
  });

  it("shows a caption at the bottom edge only when the image is wide enough on screen, sized for the zoom", () => {
    const { layer, container } = setup();
    const cap = item("a", { rect: { x: 0, y: 0, w: 300, h: 200 }, caption: "Photo: A. Person" });
    layer.update([cap], view(1));
    const span = () => container.querySelector('[data-object-id="a"] span') as HTMLElement;
    expect(span().textContent).toBe("Photo: A. Person");
    expect(span().style.display).not.toBe("none");
    expect(parseFloat(span().style.fontSize)).toBeCloseTo(11, 5);
    layer.update([cap], view(2));
    expect(parseFloat(span().style.fontSize)).toBeCloseTo(5.5, 5);
    layer.update([cap], view(0.3)); // 90 px across
    expect(span().style.display).toBe("none");
    layer.update([{ ...cap, caption: null }], view(1));
    expect(container.querySelector('[data-object-id="a"] span')).toBeNull();
  });

  it("demotes off-screen images when the memory budget is exceeded", () => {
    // 5 images wanting w2048 (2048x1536x4 = 12.6 MB each), budget for about two.
    const residency = new ImageResidency({ budgetBytes: 30 * 1024 * 1024 });
    const { layer, container } = setup({ residency });
    const items = Array.from({ length: 5 }, (_, i) => item(`i${i}`, { rect: { x: i * 3000, y: 0, w: 1600, h: 1200 } }));
    layer.update(items, view(1));
    const s = layer.stats();
    expect(s.residentBytes).toBeLessThanOrEqual(30 * 1024 * 1024);
    expect(ids(container)).toHaveLength(5);
    expect(imgOf(container, "i0").getAttribute("data-variant")).not.toBe("w256"); // on screen: kept
    expect(imgOf(container, "i1").getAttribute("data-variant")).toBe("w256"); // off screen: demoted first
  });

  it("reports resident bytes and the variant mix", () => {
    const { layer } = setup();
    layer.update([item("a"), item("b", { rect: { x: 0, y: 0, w: 600, h: 400 } })], view());
    const s = layer.stats();
    expect(s.variantCounts.w256).toBe(1);
    expect(s.variantCounts.w1024).toBe(1);
    expect(s.residentBytes).toBeGreaterThan(0);
  });

  it("re-checks 300 unchanged items in under 30 ms, and moves them all in under 400 ms", () => {
    const { layer } = setup();
    const items = Array.from({ length: 300 }, (_, i) => item(`i${i}`, { rect: { x: (i % 20) * 220, y: Math.floor(i / 20) * 170, w: 200, h: 150 }, zIndexKey: `a${i % 10}` }));
    layer.update(items, view(0.5));
    let t0 = performance.now();
    layer.update(items, view(0.5));
    expect(performance.now() - t0).toBeLessThan(30);
    t0 = performance.now();
    layer.update(items.map((it) => ({ ...it, rect: { ...it.rect, x: it.rect.x + 1 } })), view(0.5));
    expect(performance.now() - t0).toBeLessThan(400); // jsdom's style engine is slow; a real browser writes a transform per item
  });

  it("is reusable after destroy (StrictMode mounts effects twice)", () => {
    const { layer, container } = setup();
    layer.update([item("a")], view());
    layer.destroy();
    expect(ids(container)).toEqual([]);
    layer.mount(container);
    layer.update([item("a")], view());
    expect(ids(container)).toEqual(["a"]);
  });
});
