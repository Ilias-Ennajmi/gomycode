import { describe, expect, it } from "vitest";
import { arrowBounds, arrowPath } from "@/lib/engine/geometry/arrow-path";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { ArrowObj, CanvasObject, ShapeKind, ShapeObj, Terminal } from "@/lib/engine/model/types";

const meta = { index: "a0", createdAt: 0, updatedAt: 0 };

function shape(id: string, x: number, y: number, w: number, h: number, over: Partial<ShapeObj> = {}): ShapeObj {
  return { ...defaultsFor("shape"), ...meta, id, x, y, w, h, ...over };
}

function arrow(start: Terminal, end: Terminal, over: Partial<ArrowObj> = {}): ArrowObj {
  return { ...defaultsFor("arrow"), ...meta, id: "ar", x: 0, y: 0, w: 10, h: 10, start, end, ...over };
}

const point = (x: number, y: number): Terminal => ({ kind: "point", x, y });
const bound = (id: string, ax = 0.5, ay = 0.5): Terminal => ({ kind: "bound", id, anchor: { x: ax, y: ay } });

function resolverOf(...objs: CanvasObject[]) {
  const m = new Map(objs.map((o) => [o.id, o]));
  return (id: string) => m.get(id);
}

/** Distance of `p` to the outline of an axis-aligned rect (0 when on the outline). */
function rectOutlineDist(p: { x: number; y: number }, r: { x: number; y: number; w: number; h: number }) {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
  if (dx > 0 || dy > 0) return Math.hypot(dx, dy); // outside
  return Math.min(p.x - r.x, r.x + r.w - p.x, p.y - r.y, r.y + r.h - p.y); // inside
}

describe("arrowPath", () => {
  const a = shape("a", 0, 0, 100, 60);
  const b = shape("b", 300, 200, 100, 60);
  const resolve = resolverOf(a, b);

  for (const route of ["straight", "curved", "elbow"] as const) {
    it(`${route}: bound end points lie on the target outlines (±0.5)`, () => {
      const p = arrowPath(arrow(bound("a"), bound("b"), { route }), resolve);
      expect(rectOutlineDist(p.start, a)).toBeLessThan(0.5);
      expect(rectOutlineDist(p.end, b)).toBeLessThan(0.5);
      expect(p.d.startsWith("M")).toBe(true);
      expect(p.d).not.toMatch(/NaN|Infinity/);
      expect(Number.isFinite(p.labelAt.x) && Number.isFinite(p.labelAt.y)).toBe(true);
    });
  }

  it("a straight arrow between free points is the chord with its midpoint as label anchor", () => {
    const p = arrowPath(arrow(point(0, 0), point(100, 50)), resolverOf());
    expect(p.d).toBe("M 0 0 L 100 50");
    expect(p.start).toEqual({ x: 0, y: 0 });
    expect(p.end).toEqual({ x: 100, y: 50 });
    expect(p.labelAt).toEqual({ x: 50, y: 25 });
  });

  it("an edge anchor stays exactly where it is on the outline", () => {
    const p = arrowPath(arrow(bound("a", 1, 0.5), bound("b", 0, 0.5)), resolve);
    expect(p.start.x).toBeCloseTo(100, 6);
    expect(p.start.y).toBeCloseTo(30, 6);
    expect(p.end.x).toBeCloseTo(300, 6);
    expect(p.end.y).toBeCloseTo(230, 6);
  });

  it("curved bends the control point by 20 % of the chord, so the label sits off the chord", () => {
    const p = arrowPath(arrow(point(0, 0), point(100, 0), { route: "curved" }), resolverOf());
    expect(p.d).toMatch(/^M 0 0 Q /);
    expect(Math.abs(p.labelAt.y)).toBeCloseTo(10, 6); // quadratic midpoint = half of the 20 % bend
    expect(p.labelAt.x).toBeCloseTo(50, 6);
  });

  it("elbow uses orthogonal segments only", () => {
    const p = arrowPath(arrow(point(0, 0), point(100, 50), { route: "elbow" }), resolverOf());
    const nums = p.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
    expect(pts.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < pts.length; i++) {
      const same = pts[i][0] === pts[i - 1][0] || pts[i][1] === pts[i - 1][1];
      expect(same).toBe(true);
    }
  });

  it("clips to non-rect outlines (ellipse, diamond) and to rotated targets", () => {
    for (const kind of ["ellipse", "diamond", "triangle", "star"] as ShapeKind[]) {
      const e = shape("e", 0, 0, 100, 100, { kind });
      const p = arrowPath(arrow(bound("e"), point(500, 50)), resolverOf(e));
      expect(p.start.x).toBeGreaterThan(40); // left the middle of the shape
      expect(Math.hypot(p.start.x - 50, p.start.y - 50)).toBeLessThanOrEqual(71);
    }
    const rot = shape("r", 0, 0, 100, 40, { rotation: Math.PI / 2 }); // occupies x 30..70, y -30..70
    const p = arrowPath(arrow(bound("r"), point(300, 20)), resolverOf(rot));
    expect(p.start.x).toBeCloseTo(70, 4);
  });

  it("a dangling bound terminal (target gone) still yields a finite path flagged dangling", () => {
    const p = arrowPath(arrow(bound("gone"), point(100, 100), { x: 5, y: 5, w: 50, h: 50 }), resolverOf());
    expect(p.dangling).toBe(true);
    expect(p.d).not.toMatch(/NaN|Infinity/);
    expect(Number.isFinite(p.start.x)).toBe(true);
  });

  it("two coincident free points do not produce NaN", () => {
    const p = arrowPath(arrow(point(5, 5), point(5, 5), { route: "curved" }), resolverOf());
    expect(p.d).not.toMatch(/NaN|Infinity/);
  });

  it("tangent directions are unit vectors", () => {
    const p = arrowPath(arrow(point(0, 0), point(0, 100)), resolverOf());
    expect(p.endDir).toEqual({ x: 0, y: 1 });
    expect(p.startDir).toEqual({ x: 0, y: -1 });
  });
});

describe("arrowBounds", () => {
  it("covers the whole path and is at least 1x1", () => {
    const r = arrowBounds(arrow(point(10, 20), point(10, 20)), resolverOf());
    expect(r.w).toBeGreaterThanOrEqual(1);
    expect(r.h).toBeGreaterThanOrEqual(1);
    const c = arrowBounds(arrow(point(0, 0), point(100, 0), { route: "curved" }), resolverOf());
    expect(c.h).toBeGreaterThanOrEqual(10 - 1e-6);
  });
});
