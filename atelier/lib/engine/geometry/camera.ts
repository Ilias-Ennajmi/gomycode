import type { Point, Rect } from "../model/types";

/** screen = (canvas - {x, y}) * z */
export type Camera = { x: number; y: number; z: number };

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 32;

const HOME: Camera = { x: 0, y: 0, z: 1 };

function fin(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback;
}

/** Clamp to [MIN_ZOOM, MAX_ZOOM]; NaN becomes 1. */
export function clampZoom(z: number): number {
  if (Number.isNaN(z)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

export function screenToCanvas(c: Camera, p: Point): Point {
  const z = clampZoom(c.z);
  return { x: p.x / z + c.x, y: p.y / z + c.y };
}

export function canvasToScreen(c: Camera, p: Point): Point {
  const z = clampZoom(c.z);
  return { x: (p.x - c.x) * z, y: (p.y - c.y) * z };
}

/** Zoom by `factor` keeping the canvas point under `screenPoint` fixed. Invalid factors are ignored. */
export function zoomAt(c: Camera, screenPoint: Point, factor: number): Camera {
  const z0 = clampZoom(c.z);
  const cx = fin(c.x, 0);
  const cy = fin(c.y, 0);
  if (!Number.isFinite(factor) || factor <= 0) return { x: cx, y: cy, z: z0 };
  const z1 = clampZoom(z0 * factor);
  const sx = fin(screenPoint.x, 0);
  const sy = fin(screenPoint.y, 0);
  // canvas point under the cursor: s / z0 + cam; after zoom it must still map to s
  return { x: cx + sx / z0 - sx / z1, y: cy + sy / z0 - sy / z1, z: z1 };
}

/** Move the view by a screen-space drag (content follows the pointer). */
export function panBy(c: Camera, dxScreen: number, dyScreen: number): Camera {
  const z = clampZoom(c.z);
  return { x: fin(c.x, 0) - fin(dxScreen, 0) / z, y: fin(c.y, 0) - fin(dyScreen, 0) / z, z };
}

/** Camera that shows `r` centred with `padding` screen px around it, never zoomed in past `maxZoom`. */
export function fitRect(
  r: Rect | null,
  viewport: { w: number; h: number },
  padding = 64,
  maxZoom = 1,
): Camera {
  if (!r || ![r.x, r.y, r.w, r.h].every(Number.isFinite)) return { ...HOME };
  const vw = Math.max(fin(viewport.w, 1), 1);
  const vh = Math.max(fin(viewport.h, 1), 1);
  const pad = Math.max(fin(padding, 0), 0);
  const availW = Math.max(vw - 2 * pad, 1);
  const availH = Math.max(vh - 2 * pad, 1);
  const w = Math.max(r.w, 0);
  const h = Math.max(r.h, 0);
  const zx = w > 0 ? availW / w : Infinity;
  const zy = h > 0 ? availH / h : Infinity;
  const z = clampZoom(Math.min(zx, zy, fin(maxZoom, 1)));
  const cx = r.x + w / 2;
  const cy = r.y + h / 2;
  return { x: cx - vw / 2 / z, y: cy - vh / 2 / z, z };
}

/** Zoom factor for one wheel event: smooth exponential, clamped to [0.5, 2]. Scroll up (negative) zooms in. */
export function wheelToZoomFactor(deltaY: number, deltaMode: number, sensitivity: number): number {
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? 400 : 1; // lines, pages -> px-ish
  const d = Number.isNaN(deltaY) ? 0 : Math.max(-1e9, Math.min(1e9, deltaY));
  const sens = fin(sensitivity, 1);
  const f = Math.exp(-d * unit * sens * 0.002);
  if (Number.isNaN(f)) return 1;
  return Math.min(2, Math.max(0.5, f));
}

/** Per-event zoom factor of a two-finger pinch from the previous to the current finger distance (clamped). */
export function pinchFactor(prevDistance: number, distance: number): number {
  if (!Number.isFinite(prevDistance) || !Number.isFinite(distance) || prevDistance < 1e-6) return 1;
  return Math.min(2, Math.max(0.5, Math.max(distance, 0) / prevDistance));
}
