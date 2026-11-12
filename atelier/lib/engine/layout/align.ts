import { unionRects } from "../geometry/rect";
import type { Rect } from "../model/types";

export type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

/**
 * Move every rect so it lines up with `mode` on the target rect (default: the union of all of them). Sizes never
 * change and the input is not mutated.
 */
export function alignRects(rs: Rect[], mode: AlignMode, to?: Rect): Rect[] {
  const box = to ?? unionRects(rs);
  if (!box) return [];
  return rs.map((r) => {
    switch (mode) {
      case "left":
        return { ...r, x: box.x };
      case "hcenter":
        return { ...r, x: box.x + box.w / 2 - r.w / 2 };
      case "right":
        return { ...r, x: box.x + box.w - r.w };
      case "top":
        return { ...r, y: box.y };
      case "vcenter":
        return { ...r, y: box.y + box.h / 2 - r.h / 2 };
      case "bottom":
        return { ...r, y: box.y + box.h - r.h };
    }
  });
}

/**
 * Space the rects so the gaps between neighbours along `axis` are equal. The outermost extent (leftmost start to
 * rightmost end) stays where it is. Returns rects in the input order; fewer than three are returned unchanged.
 */
export function distribute(rs: Rect[], axis: "x" | "y"): Rect[] {
  if (rs.length < 3) return rs.map((r) => ({ ...r }));
  const pos = axis === "x" ? "x" : "y";
  const size = axis === "x" ? "w" : "h";
  const order = rs.map((_, i) => i).sort((a, b) => rs[a][pos] - rs[b][pos] || a - b);
  const start = Math.min(...rs.map((r) => r[pos]));
  const end = Math.max(...rs.map((r) => r[pos] + r[size]));
  const total = rs.reduce((n, r) => n + r[size], 0);
  const gap = (end - start - total) / (rs.length - 1);
  const out = rs.map((r) => ({ ...r }));
  let at = start;
  for (const i of order) {
    out[i][pos] = at;
    at += rs[i][size] + gap;
  }
  return out;
}
