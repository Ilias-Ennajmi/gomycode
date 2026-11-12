// Touch gestures for a slide deck. Pure.

/** A swipe covers at least this far... */
export const SWIPE_MIN_PX = 40;
/** ...or at least this far when it is a quick flick of this speed (px per ms). */
const FLICK_MIN_PX = 24;
const FLICK_SPEED = 0.5;
const MAX_MS = 800;
const HORIZONTAL_BIAS = 1.5;

/**
 * Is a finger movement of (dx, dy) screen px over `dtMs` a swipe to the next or previous slide? It must be mostly
 * horizontal, finished within 800 ms, and long enough (40 px, or 24 px when it is a flick). A swipe to the left
 * (dx < 0) shows the next slide.
 */
export function swipeDirection(dx: number, dy: number, dtMs: number): "next" | "prev" | null {
  if (![dx, dy, dtMs].every(Number.isFinite) || dtMs <= 0 || dtMs > MAX_MS) return null;
  const ax = Math.abs(dx);
  if (ax < HORIZONTAL_BIAS * Math.abs(dy)) return null;
  const far = ax >= SWIPE_MIN_PX;
  const flick = ax >= FLICK_MIN_PX && ax / dtMs >= FLICK_SPEED;
  if (!far && !flick) return null;
  return dx < 0 ? "next" : "prev";
}

/** A tap on the left 30 % of the surface goes back; anywhere else goes forward. */
export function tapZone(x: number, width: number): "prev" | "next" {
  return width > 0 && x < width * 0.3 ? "prev" : "next";
}
