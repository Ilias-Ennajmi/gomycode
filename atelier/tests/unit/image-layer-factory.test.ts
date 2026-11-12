// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { AssetResolver } from "@/lib/assets/resolver-types";
import { DomImageLayer } from "@/lib/engine/render/dom-image-layer";
import type { ImageLayer, ImageLayerItem, ImageLayerStats } from "@/lib/engine/render/image-layer";
import { createImageLayer, detectWebGL, type FailableImageLayer } from "@/lib/engine/render/image-layer-factory";

const resolver: AssetResolver = { url: (id, v) => `blob:${id}/${v}`, available: () => ({ variants: ["w256", "w1024"], width: 2000, height: 1500 }) };
const item = (id: string): ImageLayerItem => ({ id, assetId: id, rect: { x: 0, y: 0, w: 200, h: 150 }, rotation: 0, crop: null, mask: { kind: "rect", radius: 0 }, flipX: false, flipY: false, grayscale: false, opacity: 1, zIndexKey: "a0", caption: null });
const view = { camera: { x: 0, y: 0, z: 1 }, viewport: { w: 800, h: 600 }, dpr: 1 };
const stats: ImageLayerStats = { mounted: 0, residentBytes: 0, variantCounts: { w256: 0, w1024: 0, w2048: 0, original: 0 } };

function fakeWebGL() {
  let fail: () => void = () => {};
  const calls: string[] = [];
  const layer: FailableImageLayer = {
    onFailure: (cb) => {
      fail = cb;
    },
    mount: () => void calls.push("mount"),
    setCamera: () => void calls.push("camera"),
    setGesture: () => void calls.push("gesture"),
    update: () => void calls.push("update"),
    setDimmed: () => void calls.push("dim"),
    stats: () => stats,
    destroy: () => void calls.push("destroy"),
  };
  return { layer, calls, fail: () => fail() };
}

describe("createImageLayer", () => {
  it("returns the DOM layer when WebGL is not preferred", () => {
    const create = vi.fn();
    expect(createImageLayer({ preferWebGL: false, webglSupported: true, deps: { resolver }, createWebGL: create })).toBeInstanceOf(DomImageLayer);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns the DOM layer when WebGL is not supported", () => {
    const create = vi.fn();
    expect(createImageLayer({ preferWebGL: true, webglSupported: false, deps: { resolver }, createWebGL: create })).toBeInstanceOf(DomImageLayer);
    expect(create).not.toHaveBeenCalled();
  });

  it("uses the WebGL layer when preferred and supported", () => {
    const gl = fakeWebGL();
    const layer = createImageLayer({ preferWebGL: true, webglSupported: true, deps: { resolver }, createWebGL: () => gl.layer });
    expect(layer).not.toBeInstanceOf(DomImageLayer);
    const host = document.createElement("div");
    layer.mount(host);
    layer.update([item("a")], view);
    expect(gl.calls).toEqual(["mount", "update"]);
  });

  it("falls back to the DOM layer exactly once when WebGL fails, replaying what it was told", () => {
    const gl = fakeWebGL();
    const layer = createImageLayer({ preferWebGL: true, webglSupported: true, deps: { resolver }, createWebGL: () => gl.layer });
    const host = document.createElement("div");
    document.body.appendChild(host);
    layer.mount(host);
    layer.setCamera({ x: 5, y: 6, z: 1 });
    layer.update([item("a"), item("b")], view);

    gl.fail(); // context lost and not restored
    gl.fail(); // a second report changes nothing
    expect(gl.calls.filter((c) => c === "destroy")).toHaveLength(1);
    expect(host.querySelectorAll("[data-object-id]")).toHaveLength(2);
    expect(host.querySelector('[data-object-id="a"] img')!.getAttribute("src")).toBe("blob:a/w256");

    // From now on the DOM layer is driven.
    layer.update([item("c")], view);
    expect(host.querySelectorAll("[data-object-id]")).toHaveLength(1);
    expect(gl.calls.filter((c) => c === "update")).toHaveLength(1);
    expect(layer.stats().mounted).toBe(1);
  });

  it("falls back at once when WebGL fails before anything was mounted", () => {
    const gl = fakeWebGL();
    const layer = createImageLayer({ preferWebGL: true, webglSupported: true, deps: { resolver }, createWebGL: () => gl.layer });
    gl.fail();
    const host = document.createElement("div");
    layer.mount(host);
    layer.update([item("a")], view);
    expect(host.querySelectorAll("[data-object-id]")).toHaveLength(1);
  });

  it("keeps dimming and the gesture flag across the switch", () => {
    const gl = fakeWebGL();
    const layer: ImageLayer = createImageLayer({ preferWebGL: true, webglSupported: true, deps: { resolver }, createWebGL: () => gl.layer });
    const host = document.createElement("div");
    layer.mount(host);
    layer.setDimmed(new Set(["a"]));
    layer.update([item("a"), item("b")], view);
    gl.fail();
    expect(host.querySelector('[data-object-id="b"] img')!.getAttribute("data-dimmed")).toBe("true");
    expect(host.querySelector('[data-object-id="a"] img')!.getAttribute("data-dimmed")).toBe("false");
  });
});

describe("detectWebGL", () => {
  it("is false without a canvas that can make a context", () => {
    expect(detectWebGL(() => null as unknown as HTMLCanvasElement)).toBe(false);
    expect(detectWebGL(() => ({ getContext: () => null }) as unknown as HTMLCanvasElement)).toBe(false);
    expect(
      detectWebGL(() => {
        throw new Error("blocked");
      }),
    ).toBe(false);
  });
  it("is true when a webgl2 or webgl context exists", () => {
    expect(detectWebGL(() => ({ getContext: (k: string) => (k === "webgl2" ? {} : null) }) as unknown as HTMLCanvasElement)).toBe(true);
    expect(detectWebGL(() => ({ getContext: (k: string) => (k === "webgl" ? {} : null) }) as unknown as HTMLCanvasElement)).toBe(true);
  });
});
