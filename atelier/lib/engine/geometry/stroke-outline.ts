import { getStroke } from "perfect-freehand";
import type { StrokeObj } from "../model/types";

/** Outline polygon of a pen or highlighter stroke, relative to the object's x, y (perfect-freehand). */
export function strokeOutlinePoints(obj: StrokeObj, simplify: boolean): number[][] {
  const step = simplify ? 4 : 1;
  const pts: number[][] = [];
  const n = obj.points.length / 3;
  for (let i = 0; i < n; i += step) pts.push([obj.points[i * 3], obj.points[i * 3 + 1], obj.points[i * 3 + 2]]);
  if (simplify && n > 1 && (n - 1) % step !== 0) pts.push([obj.points[(n - 1) * 3], obj.points[(n - 1) * 3 + 1], obj.points[(n - 1) * 3 + 2]]);
  if (pts.length === 0) return [];
  const highlighter = obj.tool === "highlighter";
  return getStroke(pts, {
    size: obj.size,
    thinning: highlighter ? 0 : 0.5,
    smoothing: 0.5,
    streamline: 0.4,
    simulatePressure: false,
    last: true,
  });
}

/** Closed quadratic path through the midpoints of an outline (the smooth shape perfect-freehand recommends). */
export function outlinePath(outline: number[][]): string {
  if (outline.length < 3) return "";
  const [first, ...rest] = outline;
  let d = `M ${first[0].toFixed(2)} ${first[1].toFixed(2)}`;
  for (let i = 0; i < rest.length; i++) {
    const [x0, y0] = rest[i];
    const [x1, y1] = rest[(i + 1) % rest.length];
    d += ` Q ${x0.toFixed(2)} ${y0.toFixed(2)} ${((x0 + x1) / 2).toFixed(2)} ${((y0 + y1) / 2).toFixed(2)}`;
  }
  return `${d} Z`;
}

/** Points are x,y,pressure triples relative to the object's x, y. Simplified (every 4th point) when zoomed far out. */
export function strokeOutline(obj: StrokeObj, simplify: boolean): string {
  return outlinePath(strokeOutlinePoints(obj, simplify));
}
