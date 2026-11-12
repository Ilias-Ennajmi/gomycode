import type { Point, Rect } from "../model/types";

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

function fin(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback;
}

export function rotateAround(p: Point, center: Point, angle: number): Point {
  if (angle === 0) return { x: p.x, y: p.y };
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return { x: center.x + dx * c - dy * s, y: center.y + dx * s + dy * c };
}

/** Round an angle (radians) to a multiple of `stepDeg` degrees. */
export function snapAngle(angle: number, stepDeg = 15): number {
  if (!Number.isFinite(angle) || !(stepDeg > 0)) return 0;
  const step = (stepDeg * Math.PI) / 180;
  return Math.round(angle / step) * step + 0; // + 0 turns -0 into 0
}

type Axis = {
  fixed: number; // coordinate that stays put (opposite edge, or the centre with fromCenter)
  full: number; // new size implied by the drag, before minimums
  orient: 1 | -1; // direction from `fixed` in which the rect extends
};

/** Resolve one axis of a resize drag; `dir` is -1 for the low edge, +1 for the high edge. */
function axis(lo: number, size: number, dir: -1 | 1, d: number, fromCenter: boolean): Axis {
  const fixed = fromCenter ? lo + size / 2 : dir > 0 ? lo : lo + size;
  const moved = (dir > 0 ? lo + size : lo) + d;
  const e = dir * (moved - fixed); // signed outward extent; negative = dragged past the fixed edge
  return { fixed, full: Math.abs(e) * (fromCenter ? 2 : 1), orient: (e >= 0 ? dir : -dir) as 1 | -1 };
}

function place(a: Axis, size: number, fromCenter: boolean): number {
  if (fromCenter) return a.fixed - size / 2;
  return a.orient > 0 ? a.fixed : a.fixed - size;
}

/**
 * Resize `start` by dragging `handle` by `delta` (canvas units, in the rect's own un-rotated frame).
 * Dragging past the opposite edge flips; w and h never go below `minSize`; the result is always finite.
 */
export function resizeRect(
  start: Rect,
  handle: Handle,
  delta: Point,
  opts: { keepAspect: boolean; fromCenter: boolean; minSize: number },
): Rect {
  const min = Math.max(fin(opts.minSize, 1), 0);
  const fromCenter = opts.fromCenter;
  const dx = fin(delta.x, 0);
  const dy = fin(delta.y, 0);
  const hx = handle.includes("w") ? -1 : handle.includes("e") ? 1 : 0;
  const hy = handle.includes("n") ? -1 : handle.includes("s") ? 1 : 0;
  const ax = hx === 0 ? null : axis(start.x, start.w, hx as -1 | 1, dx, fromCenter);
  const ay = hy === 0 ? null : axis(start.y, start.h, hy as -1 | 1, dy, fromCenter);

  let w = Math.max(start.w, 0);
  let h = Math.max(start.h, 0);
  let x = start.x;
  let y = start.y;

  if (opts.keepAspect && start.w > 0 && start.h > 0 && (ax || ay)) {
    const sx = ax ? ax.full / start.w : 0;
    const sy = ay ? ay.full / start.h : 0;
    const s = Math.max(sx, sy, min / start.w, min / start.h);
    w = start.w * s;
    h = start.h * s;
    x = ax ? place(ax, w, fromCenter) : start.x + start.w / 2 - w / 2;
    y = ay ? place(ay, h, fromCenter) : start.y + start.h / 2 - h / 2;
  } else {
    if (ax) {
      w = Math.max(ax.full, min);
      x = place(ax, w, fromCenter);
    } else if (w < min) {
      x = start.x + start.w / 2 - min / 2;
      w = min;
    }
    if (ay) {
      h = Math.max(ay.full, min);
      y = place(ay, h, fromCenter);
    } else if (h < min) {
      y = start.y + start.h / 2 - min / 2;
      h = min;
    }
  }
  return { x, y, w, h };
}
