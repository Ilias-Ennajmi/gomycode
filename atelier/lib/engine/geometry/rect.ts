import type { Base, Rect } from "../model/types";

/** Axis-aligned bounds of the (rotated) rect of an object. Rotation is about the rect's centre. */
export function boundsOf(o: Pick<Base, "x" | "y" | "w" | "h" | "rotation">): Rect {
  if (o.rotation === 0) return { x: o.x, y: o.y, w: o.w, h: o.h };
  const c = Math.abs(Math.cos(o.rotation));
  const s = Math.abs(Math.sin(o.rotation));
  const w = o.w * c + o.h * s;
  const h = o.w * s + o.h * c;
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export function unionRects(rs: Rect[]): Rect | null {
  if (rs.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rs) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** True when the rects overlap or touch. */
export function intersects(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

/** True when `inner` lies fully inside `outer` (edges may coincide). */
export function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}
