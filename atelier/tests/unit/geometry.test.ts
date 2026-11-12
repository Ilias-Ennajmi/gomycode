import { describe, expect, it } from "vitest";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { ArrowObj, CanvasObject, ShapeKind, ShapeObj, StrokeObj } from "@/lib/engine/model/types";
import { boundsOf, contains, intersects, unionRects } from "@/lib/engine/geometry/rect";
import { resizeRect, rotateAround, snapAngle, type Handle } from "@/lib/engine/geometry/transform";
import { hitTest } from "@/lib/engine/geometry/hit";

const meta = { id: "o", index: "a0", createdAt: 0, updatedAt: 0 };
function shape(kind: ShapeKind, over: Partial<ShapeObj> = {}): ShapeObj {
  return { ...defaultsFor("shape"), ...meta, kind, x: 0, y: 0, w: 100, h: 100, ...over };
}

describe("rect helpers", () => {
  it("boundsOf an unrotated rect is the rect", () => {
    expect(boundsOf({ x: 10, y: 20, w: 100, h: 50, rotation: 0 })).toEqual({ x: 10, y: 20, w: 100, h: 50 });
  });

  it("boundsOf a 100x50 rect rotated 90deg is 50x100 around the same centre", () => {
    const b = boundsOf({ x: 100, y: 100, w: 100, h: 50, rotation: Math.PI / 2 });
    expect(b.w).toBeCloseTo(50, 9);
    expect(b.h).toBeCloseTo(100, 9);
    expect(b.x + b.w / 2).toBeCloseTo(150, 9);
    expect(b.y + b.h / 2).toBeCloseTo(125, 9);
  });

  it("boundsOf a rect rotated 45deg grows to the diagonal extent", () => {
    const b = boundsOf({ x: 0, y: 0, w: 100, h: 100, rotation: Math.PI / 4 });
    expect(b.w).toBeCloseTo(100 * Math.SQRT2, 9);
    expect(b.h).toBeCloseTo(100 * Math.SQRT2, 9);
  });

  it("boundsOf zero-size rects is finite", () => {
    const b = boundsOf({ x: 5, y: 5, w: 0, h: 0, rotation: 1 });
    expect(b).toEqual({ x: 5, y: 5, w: 0, h: 0 });
  });

  it("unionRects", () => {
    expect(unionRects([])).toBeNull();
    expect(unionRects([{ x: 0, y: 0, w: 10, h: 10 }])).toEqual({ x: 0, y: 0, w: 10, h: 10 });
    expect(
      unionRects([
        { x: 0, y: 0, w: 10, h: 10 },
        { x: -5, y: 20, w: 5, h: 5 },
      ]),
    ).toEqual({ x: -5, y: 0, w: 15, h: 25 });
  });

  it("intersects (edges touching count) and contains", () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    expect(intersects(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(intersects(a, { x: 10, y: 0, w: 5, h: 5 })).toBe(true);
    expect(intersects(a, { x: 10.1, y: 0, w: 5, h: 5 })).toBe(false);
    expect(contains(a, { x: 1, y: 1, w: 8, h: 8 })).toBe(true);
    expect(contains(a, { x: 1, y: 1, w: 10, h: 8 })).toBe(false);
    expect(contains(a, a)).toBe(true);
  });
});

describe("rotateAround / snapAngle", () => {
  it("rotates a point around a centre", () => {
    const p = rotateAround({ x: 10, y: 0 }, { x: 0, y: 0 }, Math.PI / 2);
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(10, 9);
    const q = rotateAround({ x: 11, y: 5 }, { x: 10, y: 5 }, Math.PI);
    expect(q.x).toBeCloseTo(9, 9);
    expect(q.y).toBeCloseTo(5, 9);
    expect(rotateAround({ x: 3, y: 4 }, { x: 1, y: 1 }, 0)).toEqual({ x: 3, y: 4 });
  });

  it("snapAngle rounds to the step", () => {
    const deg = (d: number) => (d * Math.PI) / 180;
    expect(snapAngle(deg(7))).toBeCloseTo(0, 9);
    expect(snapAngle(deg(8))).toBeCloseTo(deg(15), 9);
    expect(snapAngle(deg(-44))).toBeCloseTo(deg(-45), 9);
    expect(snapAngle(deg(50), 45)).toBeCloseTo(deg(45), 9);
    expect(Object.is(snapAngle(deg(-1)), -0)).toBe(false);
    expect(snapAngle(NaN)).toBe(0);
  });
});

describe("resizeRect", () => {
  const start = { x: 0, y: 0, w: 100, h: 50 };
  const free = { keepAspect: false, fromCenter: false, minSize: 1 };

  it("moves the dragged corner and keeps the opposite fixed", () => {
    expect(resizeRect(start, "se", { x: 20, y: 10 }, free)).toEqual({ x: 0, y: 0, w: 120, h: 60 });
    expect(resizeRect(start, "nw", { x: 10, y: 10 }, free)).toEqual({ x: 10, y: 10, w: 90, h: 40 });
    expect(resizeRect(start, "ne", { x: 10, y: -10 }, free)).toEqual({ x: 0, y: -10, w: 110, h: 60 });
    expect(resizeRect(start, "sw", { x: -10, y: 10 }, free)).toEqual({ x: -10, y: 0, w: 110, h: 60 });
  });

  it("edge handles change one axis only", () => {
    expect(resizeRect(start, "e", { x: 30, y: 999 }, free)).toEqual({ x: 0, y: 0, w: 130, h: 50 });
    expect(resizeRect(start, "w", { x: -30, y: 999 }, free)).toEqual({ x: -30, y: 0, w: 130, h: 50 });
    expect(resizeRect(start, "s", { x: 999, y: 5 }, free)).toEqual({ x: 0, y: 0, w: 100, h: 55 });
    expect(resizeRect(start, "n", { x: 999, y: -5 }, free)).toEqual({ x: 0, y: -5, w: 100, h: 55 });
  });

  it("flips when dragged past the opposite edge", () => {
    expect(resizeRect(start, "e", { x: -150, y: 0 }, free)).toEqual({ x: -50, y: 0, w: 50, h: 50 });
    expect(resizeRect(start, "w", { x: 150, y: 0 }, free)).toEqual({ x: 100, y: 0, w: 50, h: 50 });
    expect(resizeRect(start, "se", { x: -130, y: -80 }, free)).toEqual({ x: -30, y: -30, w: 30, h: 30 });
  });

  it("never goes below minSize, also when flipping through the opposite edge", () => {
    const o = { ...free, minSize: 10 };
    expect(resizeRect(start, "e", { x: -99.5, y: 0 }, o)).toEqual({ x: 0, y: 0, w: 10, h: 50 });
    expect(resizeRect(start, "e", { x: -100.5, y: 0 }, o)).toEqual({ x: -10, y: 0, w: 10, h: 50 });
    expect(resizeRect(start, "se", { x: -100.5, y: -50.5 }, o)).toEqual({ x: -10, y: -10, w: 10, h: 10 });
  });

  it("keepAspect preserves the ratio (dominant axis wins)", () => {
    const o = { ...free, keepAspect: true };
    expect(resizeRect(start, "se", { x: 100, y: 0 }, o)).toEqual({ x: 0, y: 0, w: 200, h: 100 });
    expect(resizeRect(start, "se", { x: 0, y: 100 }, o)).toEqual({ x: 0, y: 0, w: 300, h: 150 });
    const r = resizeRect(start, "nw", { x: 20, y: 3 }, o);
    expect(r.w / r.h).toBeCloseTo(2, 9);
    expect(r.x + r.w).toBeCloseTo(100, 9); // opposite corner (se) stays put
    expect(r.y + r.h).toBeCloseTo(50, 9);
  });

  it("keepAspect on an edge handle scales the other axis about the centre", () => {
    const o = { ...free, keepAspect: true };
    const r = resizeRect(start, "e", { x: 100, y: 0 }, o);
    expect(r).toEqual({ x: 0, y: -25, w: 200, h: 100 });
    const r2 = resizeRect(start, "n", { x: 0, y: -50 }, o);
    expect(r2.h).toBeCloseTo(100, 9);
    expect(r2.w).toBeCloseTo(200, 9);
    expect(r2.y + r2.h).toBeCloseTo(50, 9);
    expect(r2.x + r2.w / 2).toBeCloseTo(50, 9);
  });

  it("keepAspect still flips correctly", () => {
    const r = resizeRect(start, "se", { x: -150, y: -75 }, { ...free, keepAspect: true });
    expect(r).toEqual({ x: -50, y: -25, w: 50, h: 25 });
  });

  it("keepAspect honours minSize on both axes", () => {
    const r = resizeRect({ x: 0, y: 0, w: 400, h: 20 }, "se", { x: -399, y: -19 }, { keepAspect: true, fromCenter: false, minSize: 10 });
    expect(r.h).toBeGreaterThanOrEqual(10);
    expect(r.w).toBeGreaterThanOrEqual(10);
    expect(r.w / r.h).toBeCloseTo(20, 6);
  });

  it("fromCenter resizes symmetrically", () => {
    const o = { ...free, fromCenter: true };
    expect(resizeRect(start, "e", { x: 20, y: 0 }, o)).toEqual({ x: -20, y: 0, w: 140, h: 50 });
    expect(resizeRect(start, "se", { x: 10, y: 5 }, o)).toEqual({ x: -10, y: -5, w: 120, h: 60 });
    const f = resizeRect(start, "e", { x: -80, y: 0 }, o); // through the centre: flips symmetrically
    expect(f.x + f.w / 2).toBeCloseTo(50, 9);
    expect(f.w).toBeCloseTo(60, 9);
  });

  it("fromCenter + keepAspect", () => {
    const r = resizeRect(start, "se", { x: 50, y: 0 }, { keepAspect: true, fromCenter: true, minSize: 1 });
    expect(r.w / r.h).toBeCloseTo(2, 9);
    expect(r.x + r.w / 2).toBeCloseTo(50, 9);
    expect(r.y + r.h / 2).toBeCloseTo(25, 9);
    expect(r.w).toBeCloseTo(200, 9);
  });

  it("a zero delta is the identity", () => {
    for (const h of ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as Handle[]) {
      expect(resizeRect(start, h, { x: 0, y: 0 }, free)).toEqual(start);
      expect(resizeRect(start, h, { x: 0, y: 0 }, { ...free, keepAspect: true })).toEqual(start);
    }
  });

  it("never returns NaN for zero-size starts, NaN or infinite deltas", () => {
    const zero = { x: 3, y: 3, w: 0, h: 0 };
    for (const keepAspect of [false, true])
      for (const fromCenter of [false, true])
        for (const d of [{ x: 5, y: 5 }, { x: NaN, y: 1 }, { x: Infinity, y: -Infinity }, { x: 0, y: 0 }]) {
          const r = resizeRect(zero, "se", d, { keepAspect, fromCenter, minSize: 4 });
          for (const v of [r.x, r.y, r.w, r.h]) expect(Number.isFinite(v)).toBe(true);
          expect(r.w).toBeGreaterThanOrEqual(4);
          expect(r.h).toBeGreaterThanOrEqual(4);
        }
  });

  it("property: random inputs never produce w/h < minSize and never NaN (200 seeded iterations)", () => {
    let seed = 20261112;
    const rnd = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const handles: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
    for (let i = 0; i < 200; i++) {
      const minSize = 1 + rnd() * 30;
      const r = {
        x: (rnd() - 0.5) * 1e7,
        y: (rnd() - 0.5) * 1e7,
        w: minSize + rnd() * (rnd() < 0.3 ? 5 : 2000),
        h: minSize + rnd() * (rnd() < 0.3 ? 5 : 2000),
      };
      const handle = handles[Math.floor(rnd() * handles.length)];
      const delta = { x: (rnd() - 0.5) * (rnd() < 0.2 ? 1e5 : 800), y: (rnd() - 0.5) * (rnd() < 0.2 ? 1e5 : 800) };
      const opts = { keepAspect: rnd() < 0.5, fromCenter: rnd() < 0.5, minSize };
      const out = resizeRect(r, handle, delta, opts);
      const ctx = JSON.stringify({ r, handle, delta, opts, out });
      for (const v of [out.x, out.y, out.w, out.h]) expect(Number.isFinite(v), ctx).toBe(true);
      expect(out.w, ctx).toBeGreaterThanOrEqual(minSize - 1e-9);
      expect(out.h, ctx).toBeGreaterThanOrEqual(minSize - 1e-9);
      if (opts.keepAspect) expect(out.w / out.h, ctx).toBeCloseTo(r.w / r.h, 6);
    }
  });
});

describe("hitTest", () => {
  it("rect and roundRect: inside / outside / tolerance", () => {
    for (const kind of ["rect", "roundRect"] as ShapeKind[]) {
      const o = shape(kind, { x: 100, y: 100, w: 200, h: 100 });
      expect(hitTest(o, { x: 200, y: 150 }, 0)).toBe(true);
      expect(hitTest(o, { x: 99, y: 150 }, 0)).toBe(false);
      expect(hitTest(o, { x: 96, y: 150 }, 5)).toBe(true);
      expect(hitTest(o, { x: 300, y: 200 }, 0)).toBe(true); // edge inclusive
      expect(hitTest(o, { x: 301, y: 201 }, 0)).toBe(false);
    }
  });

  it("respects rotation", () => {
    // 200x20 bar centred at (100, 10), rotated 90deg -> vertical bar 20 wide, 200 tall
    const o = shape("rect", { x: 0, y: 0, w: 200, h: 20, rotation: Math.PI / 2 });
    expect(hitTest(o, { x: 100, y: 100 }, 0)).toBe(true);
    expect(hitTest(o, { x: 100, y: -80 }, 0)).toBe(true);
    expect(hitTest(o, { x: 95, y: 10 }, 0)).toBe(true);
    expect(hitTest(o, { x: 5, y: 10 }, 0)).toBe(false);
    expect(hitTest(o, { x: 190, y: 10 }, 0)).toBe(false);
  });

  it("ellipse is exact", () => {
    const o = shape("ellipse", { x: 0, y: 0, w: 200, h: 100 });
    expect(hitTest(o, { x: 100, y: 50 }, 0)).toBe(true);
    expect(hitTest(o, { x: 1, y: 50 }, 0)).toBe(true);
    expect(hitTest(o, { x: 5, y: 5 }, 0)).toBe(false); // bounding-box corner
    expect(hitTest(o, { x: 195, y: 95 }, 0)).toBe(false);
    expect(hitTest(o, { x: 100, y: 1 }, 0)).toBe(true);
    expect(hitTest(o, { x: 100, y: -4 }, 5)).toBe(true);
  });

  it("diamond is exact", () => {
    const o = shape("diamond", { w: 100, h: 100 });
    expect(hitTest(o, { x: 50, y: 50 }, 0)).toBe(true);
    expect(hitTest(o, { x: 50, y: 2 }, 0)).toBe(true);
    expect(hitTest(o, { x: 5, y: 5 }, 0)).toBe(false);
    expect(hitTest(o, { x: 95, y: 5 }, 0)).toBe(false);
    expect(hitTest(o, { x: 30, y: 30 }, 0)).toBe(true);
  });

  it("triangle points up and is exact", () => {
    const o = shape("triangle", { w: 100, h: 100 });
    expect(hitTest(o, { x: 50, y: 60 }, 0)).toBe(true);
    expect(hitTest(o, { x: 50, y: 99 }, 0)).toBe(true);
    expect(hitTest(o, { x: 5, y: 95 }, 0)).toBe(true); // base corner
    expect(hitTest(o, { x: 5, y: 10 }, 0)).toBe(false); // empty upper-left
    expect(hitTest(o, { x: 95, y: 10 }, 0)).toBe(false);
    expect(hitTest(o, { x: 50, y: 101 }, 0)).toBe(false);
  });

  it("star hits its centre and misses the notch between points", () => {
    const o = shape("star", { w: 100, h: 100 });
    expect(hitTest(o, { x: 50, y: 50 }, 0)).toBe(true);
    expect(hitTest(o, { x: 2, y: 2 }, 0)).toBe(false);
    expect(hitTest(o, { x: 98, y: 98 }, 0)).toBe(false);
  });

  it("image, text, sticky and frame are plain rects; groups are never hit", () => {
    for (const t of ["image", "text", "sticky", "frame"] as const) {
      const o = { ...defaultsFor(t), ...meta, x: 10, y: 10, w: 50, h: 50 } as CanvasObject;
      expect(hitTest(o, { x: 30, y: 30 }, 0)).toBe(true);
      expect(hitTest(o, { x: 70, y: 30 }, 0)).toBe(false);
    }
    const g = { ...defaultsFor("group"), ...meta, x: 10, y: 10, w: 50, h: 50 } as CanvasObject;
    expect(hitTest(g, { x: 30, y: 30 }, 0)).toBe(false);
  });

  it("straight arrows hit by distance to the path", () => {
    const a: ArrowObj = {
      ...defaultsFor("arrow"),
      ...meta,
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      start: { kind: "point", x: 0, y: 0 },
      end: { kind: "point", x: 100, y: 100 },
      strokeWidth: 2,
    };
    expect(hitTest(a, { x: 50, y: 50 }, 3)).toBe(true);
    expect(hitTest(a, { x: 52, y: 48 }, 3)).toBe(true);
    expect(hitTest(a, { x: 70, y: 30 }, 3)).toBe(false);
    expect(hitTest(a, { x: 130, y: 130 }, 3)).toBe(false); // past the end
    expect(hitTest(a, { x: 102, y: 101 }, 3)).toBe(true);
  });

  it("elbow arrows follow the right-angle path", () => {
    const a: ArrowObj = {
      ...defaultsFor("arrow"),
      ...meta,
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      route: "elbow",
      start: { kind: "point", x: 0, y: 0 },
      end: { kind: "point", x: 100, y: 100 },
    };
    expect(hitTest(a, { x: 25, y: 0 }, 2)).toBe(true);
    expect(hitTest(a, { x: 50, y: 50 }, 2)).toBe(true);
    expect(hitTest(a, { x: 75, y: 100 }, 2)).toBe(true);
    expect(hitTest(a, { x: 25, y: 25 }, 2)).toBe(false);
  });

  it("bound arrows resolve their targets when asked, and fall back to bounds otherwise", () => {
    const target = shape("rect", { id: "t", x: 200, y: 0, w: 100, h: 100 });
    const a: ArrowObj = {
      ...defaultsFor("arrow"),
      ...meta,
      x: 0,
      y: 0,
      w: 200,
      h: 50,
      start: { kind: "point", x: 0, y: 0 },
      end: { kind: "bound", id: "t", anchor: { x: 0, y: 0.5 } },
    };
    const resolve = (id: string) => (id === "t" ? target : undefined);
    expect(hitTest(a, { x: 100, y: 25 }, 2, { resolve })).toBe(true);
    expect(hitTest(a, { x: 100, y: 80 }, 2, { resolve })).toBe(false);
    expect(hitTest(a, { x: 100, y: 25 }, 2)).toBe(true); // fallback: arrow bounds
  });

  it("strokes hit by distance to the polyline, honouring size", () => {
    const s: StrokeObj = {
      ...defaultsFor("stroke"),
      ...meta,
      x: 100,
      y: 100,
      w: 100,
      h: 1,
      size: 6,
      points: [0, 0, 0.5, 50, 0, 0.5, 100, 0, 0.5],
    };
    expect(hitTest(s, { x: 150, y: 100 }, 1)).toBe(true);
    expect(hitTest(s, { x: 150, y: 103 }, 1)).toBe(true); // within size/2 + tol
    expect(hitTest(s, { x: 150, y: 110 }, 1)).toBe(false);
    expect(hitTest(s, { x: 250, y: 100 }, 1)).toBe(false);
  });

  it("degenerate strokes (no or one point) do not throw or hit wildly", () => {
    const base = { ...defaultsFor("stroke"), ...meta, x: 0, y: 0, w: 1, h: 1, size: 4 } as StrokeObj;
    expect(hitTest({ ...base, points: [] }, { x: 0, y: 0 }, 5)).toBe(false);
    expect(hitTest({ ...base, points: [10, 10, 0.5] }, { x: 10, y: 11 }, 2)).toBe(true);
    expect(hitTest({ ...base, points: [10, 10, 0.5] }, { x: 50, y: 50 }, 2)).toBe(false);
  });

  it("never returns true for a non-finite point", () => {
    const o = shape("rect");
    expect(hitTest(o, { x: NaN, y: 0 }, 5)).toBe(false);
    expect(hitTest(o, { x: Infinity, y: 0 }, 5)).toBe(false);
  });
});
