import type { ArrowObj, CanvasObject, Point, ShapeKind, StrokeObj } from "../model/types";
import { boundsOf } from "./rect";
import { rotateAround } from "./transform";

export type HitOptions = {
  /** Resolves bound arrow terminals. Without it, a bound arrow is hit-tested by its bounds. */
  resolve?: (id: string) => CanvasObject | undefined;
};

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distToPolyline(p: Point, pts: Point[]): number {
  if (pts.length === 0) return Infinity;
  if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y);
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, distToSegment(p, pts[i - 1], pts[i]));
  return best;
}

function insidePolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function polygonHit(p: Point, poly: Point[], tol: number): boolean {
  if (insidePolygon(p, poly)) return true;
  return tol > 0 && distToPolyline(p, [...poly, poly[0]]) <= tol;
}

/** Outline of the non-rect shapes in the local frame, origin at the shape's centre. */
function polygonFor(kind: ShapeKind, hw: number, hh: number): Point[] | null {
  switch (kind) {
    case "triangle":
      return [
        { x: 0, y: -hh },
        { x: hw, y: hh },
        { x: -hw, y: hh },
      ];
    case "diamond":
      return [
        { x: 0, y: -hh },
        { x: hw, y: 0 },
        { x: 0, y: hh },
        { x: -hw, y: 0 },
      ];
    case "star": {
      const pts: Point[] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 1 : 0.382;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push({ x: Math.cos(a) * hw * r, y: Math.sin(a) * hh * r });
      }
      return pts;
    }
    default:
      return null;
  }
}

function terminalPoint(t: ArrowObj["start"], resolve: HitOptions["resolve"]): Point | null {
  if (t.kind === "point") return { x: t.x, y: t.y };
  const target = resolve?.(t.id);
  if (!target) return null;
  const c = { x: target.x + target.w / 2, y: target.y + target.h / 2 };
  const local = { x: target.x + t.anchor.x * target.w, y: target.y + t.anchor.y * target.h };
  return rotateAround(local, c, target.rotation);
}

function arrowPath(o: ArrowObj, resolve: HitOptions["resolve"]): Point[] | null {
  const a = terminalPoint(o.start, resolve);
  const b = terminalPoint(o.end, resolve);
  if (!a || !b) return null;
  if (o.route === "elbow") {
    const mx = (a.x + b.x) / 2;
    return [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b];
  }
  return [a, b]; // "curved" is approximated by its chord here
}

function strokeHit(o: StrokeObj, p: Point, tol: number): boolean {
  const pts: Point[] = [];
  for (let i = 0; i + 2 < o.points.length; i += 3) {
    pts.push({ x: o.x + o.points[i], y: o.y + o.points[i + 1] });
  }
  if (pts.length === 0) return false;
  return distToPolyline(p, pts) <= tol + o.size / 2;
}

/**
 * Does canvas point `p` hit the object? `tolerance` is in canvas units (callers convert screen px by zoom).
 * Rects (image, text, sticky, frame, rect shapes) hit anywhere inside, other shapes by exact outline, arrows and
 * strokes by distance to their path. Groups are invisible and never hit.
 */
export function hitTest(o: CanvasObject, p: Point, tolerance: number, opts: HitOptions = {}): boolean {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
  const tol = Math.max(Number.isFinite(tolerance) ? tolerance : 0, 0);
  if (o.type === "group") return false;

  if (o.type === "arrow") {
    const path = arrowPath(o, opts.resolve);
    if (path) return distToPolyline(p, path) <= tol + o.strokeWidth / 2;
    const b = boundsOf(o);
    return p.x >= b.x - tol && p.x <= b.x + b.w + tol && p.y >= b.y - tol && p.y <= b.y + b.h + tol;
  }

  // local frame: un-rotate the point about the object's centre
  const center = { x: o.x + o.w / 2, y: o.y + o.h / 2 };
  const q = o.rotation === 0 ? p : rotateAround(p, center, -o.rotation);

  if (o.type === "stroke") return strokeHit(o, q, tol);

  const lx = q.x - center.x;
  const ly = q.y - center.y;
  const hw = o.w / 2;
  const hh = o.h / 2;

  if (o.type === "shape") {
    if (o.kind === "ellipse") {
      const rx = hw + tol;
      const ry = hh + tol;
      return (lx / rx) ** 2 + (ly / ry) ** 2 <= 1;
    }
    const poly = polygonFor(o.kind, hw, hh);
    if (poly) return polygonHit({ x: lx, y: ly }, poly, tol);
  }
  return Math.abs(lx) <= hw + tol && Math.abs(ly) <= hh + tol;
}
