import type { Head, Point } from "../model/types";

export type HeadShape = { d: string; filled: boolean };

/**
 * Path data of an arrow head whose tip sits at `tip` and which points along `dir` (a unit vector, away from the line).
 * Shared by the canvas view and the export scene so both draw the same heads. `null` for "none".
 */
export function headShape(head: Head, tip: Point, dir: Point, size: number): HeadShape | null {
  if (head === "none") return null;
  const back = { x: -dir.x, y: -dir.y };
  const rot = (v: Point, a: number): Point => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });
  const at = (v: Point, len: number): Point => ({ x: tip.x + v.x * len, y: tip.y + v.y * len });
  const f = (p: Point) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  switch (head) {
    case "arrow": {
      const a = at(rot(back, 0.45), size);
      const b = at(rot(back, -0.45), size);
      return { d: `M ${f(a)} L ${f(tip)} L ${f(b)}`, filled: false };
    }
    case "triangle": {
      const a = at(rot(back, 0.4), size);
      const b = at(rot(back, -0.4), size);
      return { d: `M ${f(tip)} L ${f(a)} L ${f(b)} Z`, filled: true };
    }
    case "dot": {
      const r = size * 0.4;
      const c = at(back, r);
      return { d: `M ${f({ x: c.x - r, y: c.y })} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`, filled: true };
    }
    case "bar": {
      const n = { x: -dir.y, y: dir.x };
      const a = at(n, size * 0.5);
      const b = at(n, -size * 0.5);
      return { d: `M ${f(a)} L ${f(b)}`, filled: false };
    }
  }
}
