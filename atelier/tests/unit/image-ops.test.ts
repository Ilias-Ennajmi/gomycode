import { describe, expect, it } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { ImageObj, NewObject, Rect } from "@/lib/engine/model/types";
import {
  CROP_PRESETS,
  clampCrop,
  cropForAspect,
  cropForReplacement,
  cropPixelAspect,
  maskRadii,
  moveCropWindow,
  resizeCropWindow,
} from "@/lib/engine/images/crop";
import { applyCrop, flipImages, replaceImageAsset, setGrayscale, setMask } from "@/lib/engine/images/ops";
import { imageClip, imageStyle, toDisplayCrop } from "@/lib/engine/model/image-style";

const img = (id: string, extra: Partial<ImageObj> = {}): NewObject =>
  ({ ...defaultsFor("image"), id, assetId: "a", x: 10, y: 20, w: 200, h: 150, ...extra }) as NewObject;
const get = (doc: BoardDoc, id: string) => doc.get(id) as ImageObj;

const approx = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);
const pixelRatio = (r: Rect, src: { w: number; h: number }) => (r.w * src.w) / (r.h * src.h);

describe("crop presets", () => {
  it("lists free, 1:1, 4:5, 3:4, 16:9, 9:16", () => {
    expect(CROP_PRESETS.map((p) => p.id)).toEqual(["free", "1:1", "4:5", "3:4", "16:9", "9:16"]);
    expect(CROP_PRESETS[0].ratio).toBeNull();
    expect(CROP_PRESETS[4].ratio).toBeCloseTo(16 / 9);
  });
});

describe("clampCrop", () => {
  it("keeps the rect inside [0,1] with a minimum size of 0.02", () => {
    expect(clampCrop({ x: -0.2, y: 0.9, w: 0.5, h: 0.5 })).toEqual({ x: 0, y: 0.5, w: 0.5, h: 0.5 });
    const tiny = clampCrop({ x: 0.5, y: 0.5, w: 0, h: -1 });
    expect(tiny.w).toBeCloseTo(0.02);
    expect(tiny.h).toBeCloseTo(0.02);
    const big = clampCrop({ x: 0.3, y: 0.3, w: 3, h: 3 });
    expect(big).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
  it("never returns NaN", () => {
    const r = clampCrop({ x: NaN, y: Infinity, w: NaN, h: NaN });
    for (const v of Object.values(r)) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("cropForAspect", () => {
  it("1:1 on a 4000x3000 source is the centred 3000x3000 square", () => {
    const r = cropForAspect({ w: 4000, h: 3000 }, null, 1);
    approx(r.x, 0.125);
    approx(r.y, 0);
    approx(r.w, 0.75);
    approx(r.h, 1);
  });
  it("16:9 on a portrait source fills the full width", () => {
    const r = cropForAspect({ w: 3000, h: 4000 }, null, 16 / 9);
    approx(r.w, 1);
    approx(pixelRatio(r, { w: 3000, h: 4000 }), 16 / 9);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-12);
  });
  it("9:16 on a landscape source fills the full height", () => {
    const r = cropForAspect({ w: 4000, h: 3000 }, null, 9 / 16);
    approx(r.h, 1);
    approx(pixelRatio(r, { w: 4000, h: 3000 }), 9 / 16);
  });
  it("stays centred on the current crop centre and inside [0,1] when that is off-centre", () => {
    const cur = { x: 0.6, y: 0.1, w: 0.4, h: 0.3 };
    const r = cropForAspect({ w: 4000, h: 3000 }, cur, 1);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-12);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-12);
    approx(pixelRatio(r, { w: 4000, h: 3000 }), 1);
  });
  it("a null ratio returns the current crop, or the whole image", () => {
    const cur = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
    expect(cropForAspect({ w: 100, h: 100 }, cur, null)).toEqual(cur);
    expect(cropForAspect({ w: 100, h: 100 }, null, null)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
  it("holds for every preset on odd sources", () => {
    for (const src of [{ w: 20000, h: 200 }, { w: 1, h: 1 }, { w: 640, h: 4800 }]) {
      for (const p of CROP_PRESETS) {
        if (p.ratio === null) continue;
        const r = cropForAspect(src, null, p.ratio);
        expect(r.x).toBeGreaterThanOrEqual(-1e-12);
        expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
        expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });
});

describe("cropPixelAspect", () => {
  it("is the source aspect without a crop and the cropped pixel aspect with one", () => {
    approx(cropPixelAspect({ w: 400, h: 200 }, null), 2);
    approx(cropPixelAspect({ w: 400, h: 200 }, { x: 0, y: 0, w: 0.5, h: 1 }), 1);
  });
});

describe("applyCrop", () => {
  it("keeps x, y, w and sets h so w/h is the crop's pixel aspect; one undo step", () => {
    const doc = new BoardDoc();
    doc.createMany([img("i")]);
    doc.stopCapturing();
    const src = { w: 4000, h: 3000 };
    const crop = cropForAspect(src, null, 1);
    applyCrop(doc, "i", crop, src);
    const o = get(doc, "i");
    expect(o.crop).toEqual(crop);
    expect(o.x).toBe(10);
    expect(o.y).toBe(20);
    expect(o.w).toBe(200);
    approx(o.w / o.h, cropPixelAspect(src, crop));
    doc.undo();
    expect(get(doc, "i").crop).toBeNull();
    expect(get(doc, "i").h).toBe(150);
    expect(doc.canUndo()).toBe(true); // the creation is still there; nothing else was left behind
  });
  it("null restores the source aspect", () => {
    const doc = new BoardDoc();
    const src = { w: 4000, h: 3000 };
    doc.createMany([img("i", { crop: { x: 0.125, y: 0, w: 0.75, h: 1 }, h: 200 })]);
    applyCrop(doc, "i", null, src);
    const o = get(doc, "i");
    expect(o.crop).toBeNull();
    approx(o.w / o.h, 4 / 3);
  });
  it("ignores locked images and non-images", () => {
    const doc = new BoardDoc();
    doc.createMany([img("l", { locked: true }), { ...defaultsFor("sticky"), id: "s" } as NewObject]);
    applyCrop(doc, "l", { x: 0, y: 0, w: 0.5, h: 0.5 }, { w: 100, h: 100 });
    applyCrop(doc, "s", { x: 0, y: 0, w: 0.5, h: 0.5 }, { w: 100, h: 100 });
    expect(get(doc, "l").crop).toBeNull();
  });
});

describe("maskRadii", () => {
  it("rect is square cornered", () => {
    expect(maskRadii({ w: 100, h: 40, mask: { kind: "rect", radius: 12 } })).toEqual({ rx: 0, ry: 0 });
  });
  it("rounded clamps to half the short side", () => {
    expect(maskRadii({ w: 100, h: 40, mask: { kind: "rounded", radius: 999 } })).toEqual({ rx: 20, ry: 20 });
    expect(maskRadii({ w: 100, h: 40, mask: { kind: "rounded", radius: 8 } })).toEqual({ rx: 8, ry: 8 });
  });
  it("circle is the inscribed ellipse", () => {
    expect(maskRadii({ w: 100, h: 40, mask: { kind: "circle", radius: 0 } })).toEqual({ rx: 50, ry: 20 });
  });
  it("is finite for degenerate sizes and negative radii", () => {
    const r = maskRadii({ w: 0, h: 0, mask: { kind: "rounded", radius: -5 } });
    expect(r).toEqual({ rx: 0, ry: 0 });
  });
});

describe("cropForReplacement", () => {
  const oldSrc = { w: 4000, h: 3000 };
  it("keeps the box aspect when the new image has a different aspect, inside [0,1]", () => {
    const old = get(new BoardDoc(), "x") ?? ({ ...defaultsFor("image"), w: 200, h: 200, crop: { x: 0.125, y: 0, w: 0.75, h: 1 } } as ImageObj);
    for (const newSrc of [{ w: 1000, h: 3000 }, { w: 3000, h: 1000 }, { w: 500, h: 500 }]) {
      const r = cropForReplacement(old, oldSrc, newSrc);
      expect(r.x).toBeGreaterThanOrEqual(-1e-12);
      expect(r.y).toBeGreaterThanOrEqual(-1e-12);
      expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
      expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9);
      approx(pixelRatio(r, newSrc), old.w / old.h, 1e-6);
    }
  });
  it("keeps the old crop's centre when there is room", () => {
    const old = { ...defaultsFor("image"), w: 200, h: 200, crop: { x: 0.0, y: 0.0, w: 0.5, h: 0.5 } } as ImageObj;
    const r = cropForReplacement(old, { w: 1000, h: 1000 }, { w: 1000, h: 1000 });
    approx(r.x + r.w / 2, 0.25);
    approx(r.y + r.h / 2, 0.25);
    approx(r.w * r.h, 0.25);
  });
  it("an uncropped old image gets the largest window of the box aspect", () => {
    const old = { ...defaultsFor("image"), w: 300, h: 100, crop: null } as ImageObj;
    const r = cropForReplacement(old, { w: 300, h: 100 }, { w: 1000, h: 1000 });
    approx(r.w, 1);
    approx(pixelRatio(r, { w: 1000, h: 1000 }), 3);
  });
  it("never returns NaN for broken sizes", () => {
    const old = { ...defaultsFor("image"), w: 0, h: 0, crop: null } as ImageObj;
    const r = cropForReplacement(old, { w: 0, h: 0 }, { w: 0, h: 0 });
    for (const v of Object.values(r)) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("replaceImageAsset", () => {
  it("swaps the asset, sets the new crop, keeps w, h, mask, opacity; one undo step", () => {
    const doc = new BoardDoc();
    doc.createMany([img("i", { mask: { kind: "rounded", radius: 12 }, opacity: 0.5, crop: { x: 0.125, y: 0, w: 0.75, h: 1 }, h: 200 })]);
    doc.stopCapturing();
    replaceImageAsset(doc, "i", "newAsset", { w: 4000, h: 3000 }, { w: 1000, h: 3000 });
    const o = get(doc, "i");
    expect(o.assetId).toBe("newAsset");
    expect(o.w).toBe(200);
    expect(o.h).toBe(200);
    expect(o.mask).toEqual({ kind: "rounded", radius: 12 });
    expect(o.opacity).toBe(0.5);
    approx(pixelRatio(o.crop ?? { x: 0, y: 0, w: 1, h: 1 }, { w: 1000, h: 3000 }), 1, 1e-6);
    doc.undo();
    expect(get(doc, "i").assetId).toBe("a");
    expect(get(doc, "i").crop).toEqual({ x: 0.125, y: 0, w: 0.75, h: 1 });
  });
});

describe("mask, grayscale and flip", () => {
  const setup = () => {
    const doc = new BoardDoc();
    doc.createMany([img("a"), img("b"), { ...defaultsFor("sticky"), id: "s" } as NewObject, img("l", { locked: true })]);
    doc.stopCapturing();
    return doc;
  };
  it("setMask applies to images only, one undo step", () => {
    const doc = setup();
    setMask(doc, ["a", "b", "s", "l"], { kind: "circle", radius: 0 });
    expect(get(doc, "a").mask.kind).toBe("circle");
    expect(get(doc, "b").mask.kind).toBe("circle");
    expect(get(doc, "l").mask.kind).toBe("rect");
    doc.undo();
    expect(get(doc, "a").mask.kind).toBe("rect");
    expect(get(doc, "b").mask.kind).toBe("rect");
  });
  it("setMask sanitises a negative radius", () => {
    const doc = setup();
    setMask(doc, ["a"], { kind: "rounded", radius: -4 });
    expect(get(doc, "a").mask.radius).toBe(0);
  });
  it("setGrayscale on a multi-selection is one undo step", () => {
    const doc = setup();
    setGrayscale(doc, ["a", "b"], true);
    expect(get(doc, "a").grayscale && get(doc, "b").grayscale).toBe(true);
    doc.undo();
    expect(get(doc, "a").grayscale || get(doc, "b").grayscale).toBe(false);
  });
  it("flipImages toggles only images in a mixed selection", () => {
    const doc = setup();
    flipImages(doc, ["a", "s"], "x");
    expect(get(doc, "a").flipX).toBe(true);
    expect(get(doc, "a").flipY).toBe(false);
    flipImages(doc, ["a"], "y");
    expect(get(doc, "a").flipY).toBe(true);
    flipImages(doc, ["a"], "x");
    expect(get(doc, "a").flipX).toBe(false);
  });
});

describe("crop window geometry", () => {
  const src = { w: 4000, h: 3000 };
  it("moveCropWindow clamps inside the image", () => {
    const w = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 };
    expect(moveCropWindow(w, 5, 5)).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
    expect(moveCropWindow(w, -5, -5)).toEqual({ x: 0, y: 0, w: 0.5, h: 0.5 });
  });
  it("a free resize drags only the edges that move", () => {
    const w = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 };
    const r = resizeCropWindow(w, "se", 0.1, 0.05, { src, ratio: null });
    approx(r.x, 0.2);
    approx(r.w, 0.6);
    approx(r.h, 0.55);
  });
  it("a locked ratio is kept through every handle and stays inside the image", () => {
    const start = cropForAspect(src, null, 1);
    const half = { x: 0.3, y: 0.3, w: start.w / 2, h: start.h / 2 };
    for (const handle of ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const) {
      for (const [dx, dy] of [[0.3, 0.3], [-0.4, -0.2], [0.9, -0.9], [-0.01, 0.02]]) {
        const r = resizeCropWindow(half, handle, dx, dy, { src, ratio: 1 });
        approx(pixelRatio(r, src), 1, 1e-9);
        expect(r.x).toBeGreaterThanOrEqual(-1e-9);
        expect(r.y).toBeGreaterThanOrEqual(-1e-9);
        expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
        expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9);
        expect(r.w).toBeGreaterThanOrEqual(0.02 - 1e-12);
      }
    }
  });
  it("never inverts or collapses on a huge drag", () => {
    const w = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 };
    const r = resizeCropWindow(w, "nw", 9, 9, { src, ratio: null });
    expect(r.w).toBeGreaterThanOrEqual(0.02 - 1e-12);
    expect(r.h).toBeGreaterThanOrEqual(0.02 - 1e-12);
  });
});

describe("imageStyle / imageClip (pure)", () => {
  const base = { ...defaultsFor("image"), w: 200, h: 100 } as unknown as ImageObj;
  it("an uncropped image covers its box", () => {
    const s = imageStyle(base, false);
    expect(s.width).toBe("100%");
    expect(s.height).toBe("100%");
    expect(s.filter).toBeUndefined();
  });
  it("a crop positions the full image inside the box", () => {
    const s = imageStyle({ ...base, crop: { x: 0.25, y: 0, w: 0.5, h: 1 } }, false);
    expect(s.width).toBe(400);
    expect(s.height).toBe(100);
    expect(s.left).toBe(-100);
    expect(s.top).toBe(0);
  });
  it("grayscale per image or board-wide gives a grayscale filter", () => {
    expect(imageStyle({ ...base, grayscale: true }, false).filter).toBe("grayscale(1)");
    expect(imageStyle(base, true).filter).toBe("grayscale(1)");
  });
  it("flip mirrors the image and the crop window follows the picture", () => {
    const s = imageStyle({ ...base, flipX: true, crop: { x: 0, y: 0, w: 0.5, h: 1 } }, false);
    expect(s.transform).toBe("scale(-1, 1)");
    // the source's left half, mirrored, sits in the right half of the displayed image
    expect(s.left).toBe(-200);
    expect(toDisplayCrop({ x: 0, y: 0, w: 0.5, h: 1 }, true, false)).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 });
    expect(toDisplayCrop(toDisplayCrop({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, true, true), true, true).x).toBeCloseTo(0.1);
  });
  it("clip follows the mask", () => {
    expect(imageClip(base).borderRadius).toBeUndefined();
    expect(imageClip({ ...base, mask: { kind: "rounded", radius: 12 } }).borderRadius).toBe("12px / 12px");
    expect(imageClip({ ...base, mask: { kind: "circle", radius: 0 } }).borderRadius).toBe("100px / 50px");
  });
});
