import type { ArrowObj, CanvasObject, Point, Rect, Terminal } from "../model/types";
import { hitTest } from "./hit";
import { rotateAround } from "./transform";

export type ArrowGeometry = {
  /** SVG path data in absolute canvas coordinates. */
  d: string;
  /** End points after clipping to the bound targets' outlines. */
  start: Point;
  end: Point;
  /** Where a label sits: the middle of the visible path. */
  labelAt: Point;
  /** Unit vectors in the direction an arrow head at each end points (away from the path). */
  startDir: Point;
  endDir: Point;
  /** True when a bound terminal's target no longer exists; the terminal falls back to the arrow's own box. */
  dangling: boolean;
  /** The visible path as a polyline (curves sampled), for bounds and hit tests. */
  points: Point[];
};

type Resolve = (id: string) => CanvasObject | undefined;

const SCAN_STEPS = 96;
const BEND = 0.2;

/** Canvas position of a normalised anchor on a (possibly rotated) target. */
export function anchorPoint(target: CanvasObject, anchor: Point): Point {
  const c = { x: target.x + target.w / 2, y: target.y + target.h / 2 };
  return rotateAround({ x: target.x + anchor.x * target.w, y: target.y + anchor.y * target.h }, c, target.rotation);
}

/** Where a terminal sits before clipping, or null when it is bound to something that no longer exists. */
export function terminalPoint(t: Terminal, resolve: Resolve): Point | null {
  if (t.kind === "point") return { x: t.x, y: t.y };
  const target = resolve(t.id);
  return target ? anchorPoint(target, t.anchor) : null;
}

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);
const pt = (p: Point) => `${fmt(p.x)} ${fmt(p.y)}`;
const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function unit(from: Point, to: Point, fallback: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (!(len > 1e-9)) return fallback;
  return { x: dx / len + 0, y: dy / len + 0 };
}

/** A route as a function of t in [0, 1]. */
type Route =
  | { kind: "line"; a: Point; b: Point }
  | { kind: "poly"; pts: Point[]; cum: number[] }
  | { kind: "quad"; a: Point; c: Point; b: Point };

function polyRoute(pts: Point[]): Route {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { kind: "poly", pts, cum };
}

function at(r: Route, t: number): Point {
  switch (r.kind) {
    case "line":
      return lerp(r.a, r.b, t);
    case "quad": {
      const u = 1 - t;
      return {
        x: u * u * r.a.x + 2 * u * t * r.c.x + t * t * r.b.x,
        y: u * u * r.a.y + 2 * u * t * r.c.y + t * t * r.b.y,
      };
    }
    case "poly": {
      const total = r.cum[r.cum.length - 1];
      if (!(total > 0)) return r.pts[0];
      const s = t * total;
      for (let i = 1; i < r.pts.length; i++) {
        if (s <= r.cum[i] || i === r.pts.length - 1) {
          const seg = r.cum[i] - r.cum[i - 1];
          return lerp(r.pts[i - 1], r.pts[i], seg > 0 ? (s - r.cum[i - 1]) / seg : 0);
        }
      }
      return r.pts[r.pts.length - 1];
    }
  }
}

function inside(target: CanvasObject | undefined, p: Point): boolean {
  return !!target && target.type !== "arrow" && hitTest(target, p, 0);
}

/**
 * Parameter where the route leaves `target`, scanning from `from` towards `to` (both t values). Returns `from`
 * when the route does not start inside the target or never leaves it.
 */
function exitParam(r: Route, target: CanvasObject | undefined, from: number, to: number): number {
  if (!target || !inside(target, at(r, from))) return from;
  let lo = from;
  for (let i = 1; i <= SCAN_STEPS; i++) {
    const t = from + ((to - from) * i) / SCAN_STEPS;
    if (inside(target, at(r, t))) {
      lo = t;
      continue;
    }
    let a = lo;
    let b = t;
    for (let k = 0; k < 40; k++) {
      const m = (a + b) / 2;
      if (inside(target, at(r, m))) a = m;
      else b = m;
    }
    return a;
  }
  return from; // never leaves: both ends inside the same target, leave unclipped
}

function wantsHorizontalFirst(a: Point, b: Point, start: Terminal, resolve: Resolve): boolean {
  if (start.kind === "bound" && resolve(start.id)) {
    const { x, y } = start.anchor;
    if (x <= 0.001 || x >= 0.999) return true;
    if (y <= 0.001 || y >= 0.999) return false;
  }
  return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
}

function subPoly(r: Extract<Route, { kind: "poly" }>, t0: number, t1: number): Point[] {
  const total = r.cum[r.cum.length - 1];
  const out: Point[] = [at(r, t0)];
  for (let i = 1; i < r.pts.length - 1; i++) {
    const t = total > 0 ? r.cum[i] / total : 0;
    if (t > t0 && t < t1) out.push(r.pts[i]);
  }
  out.push(at(r, t1));
  return out;
}

/** Geometry of an arrow: a path from its start to its end terminal, clipped to the outlines of bound targets. */
export function arrowPath(a: ArrowObj, resolve: Resolve): ArrowGeometry {
  const sp = terminalPoint(a.start, resolve);
  const ep = terminalPoint(a.end, resolve);
  const dangling = sp === null || ep === null;
  const A = sp ?? { x: a.x, y: a.y };
  const B = ep ?? { x: a.x + a.w, y: a.y + a.h };
  const sTarget = a.start.kind === "bound" && sp ? resolve(a.start.id) : undefined;
  const eTarget = a.end.kind === "bound" && ep ? resolve(a.end.id) : undefined;

  let route: Route;
  if (a.route === "curved") {
    const len = Math.hypot(B.x - A.x, B.y - A.y);
    const mid = lerp(A, B, 0.5);
    const n = len > 1e-9 ? { x: -(B.y - A.y) / len, y: (B.x - A.x) / len } : { x: 0, y: 0 };
    route = { kind: "quad", a: A, c: { x: mid.x + n.x * BEND * len, y: mid.y + n.y * BEND * len }, b: B };
  } else if (a.route === "elbow" && Math.abs(B.x - A.x) > 1e-9 && Math.abs(B.y - A.y) > 1e-9) {
    const horizontal = wantsHorizontalFirst(A, B, a.start, resolve);
    route = polyRoute([A, horizontal ? { x: B.x, y: A.y } : { x: A.x, y: B.y }, B]);
  } else {
    route = { kind: "line", a: A, b: B };
  }

  let t0 = exitParam(route, sTarget, 0, 1);
  let t1 = exitParam(route, eTarget, 1, 0);
  if (!(t0 < t1)) {
    t0 = 0;
    t1 = 1;
  }

  const start = at(route, t0);
  const end = at(route, t1);
  let d: string;
  let points: Point[];
  let labelAt: Point;
  let startDir: Point;
  let endDir: Point;

  if (route.kind === "quad") {
    // Sub-curve of a quadratic Bezier between t0 and t1 is a quadratic Bezier.
    const k = t1 - t0;
    const tx = (1 - t0) * (route.c.x - route.a.x) + t0 * (route.b.x - route.c.x);
    const ty = (1 - t0) * (route.c.y - route.a.y) + t0 * (route.b.y - route.c.y);
    const c = { x: start.x + k * tx, y: start.y + k * ty };
    d = `M ${pt(start)} Q ${pt(c)} ${pt(end)}`;
    const sub: Route = { kind: "quad", a: start, c, b: end };
    points = Array.from({ length: 17 }, (_, i) => at(sub, i / 16));
    labelAt = at(sub, 0.5);
    startDir = unit(c, start, unit(end, start, { x: -1, y: 0 }));
    endDir = unit(c, end, unit(start, end, { x: 1, y: 0 }));
  } else if (route.kind === "poly") {
    points = subPoly(route, t0, t1);
    d = `M ${points.map(pt).join(" L ")}`;
    const sub = polyRoute(points);
    labelAt = at(sub, 0.5);
    startDir = unit(points[1], points[0], { x: -1, y: 0 });
    endDir = unit(points[points.length - 2], points[points.length - 1], { x: 1, y: 0 });
  } else {
    points = [start, end];
    d = `M ${pt(start)} L ${pt(end)}`;
    labelAt = lerp(start, end, 0.5);
    endDir = unit(start, end, { x: 1, y: 0 });
    startDir = { x: -endDir.x + 0, y: -endDir.y + 0 };
  }

  return { d, start, end, labelAt, startDir, endDir, dangling, points };
}

/** Bounding box of the visible path (at least 1 x 1), for the arrow's own x, y, w, h. */
export function arrowBounds(a: ArrowObj, resolve: Resolve): Rect {
  const { points } = arrowPath(a, resolve);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  if (!Number.isFinite(x0 + y0 + x1 + y1)) return { x: a.x, y: a.y, w: Math.max(a.w, 1), h: Math.max(a.h, 1) };
  return { x: x0, y: y0, w: Math.max(x1 - x0, 1), h: Math.max(y1 - y0, 1) };
}
