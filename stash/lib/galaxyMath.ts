/*
 * Galaxy lens geometry. Pure functions, unit-tested (tests/unit/galaxyMath.test.ts).
 *
 * World coordinates come from the worker in -1..1. The view maps them to screen
 * pixels: screen = centre + world * fit * scale + (tx, ty), where `fit` makes the
 * whole galaxy fill the viewport at scale 1.
 */

export type GalaxyPoint = { saveId: string; x: number; y: number; cluster: number };
export type GalaxyCluster = { cluster: number; label: string; cx: number; cy: number; size: number };
export type View = { scale: number; tx: number; ty: number };
export type Size = { width: number; height: number };

export const MIN_SCALE = 1;
export const MAX_SCALE = 8;
export const HOME: View = { scale: 1, tx: 0, ty: 0 };
/** Inner margin, so dots and labels at the edge stay visible. */
const MARGIN = 0.9;

export function fit(size: Size): number {
  return (Math.min(size.width, size.height) / 2) * MARGIN;
}

export function toScreen(view: View, size: Size, x: number, y: number): { x: number; y: number } {
  const f = fit(size) * view.scale;
  return { x: size.width / 2 + x * f + view.tx, y: size.height / 2 + y * f + view.ty };
}

export function toWorld(view: View, size: Size, sx: number, sy: number): { x: number; y: number } {
  const f = fit(size) * view.scale;
  return { x: (sx - size.width / 2 - view.tx) / f, y: (sy - size.height / 2 - view.ty) / f };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Keeps the galaxy from being dragged off screen: some of it always stays in view. */
export function clampView(view: View, size: Size): View {
  const scale = clamp(view.scale, MIN_SCALE, MAX_SCALE);
  const limit = fit(size) * scale; // world edge (±1) distance from the centre
  return { scale, tx: clamp(view.tx, -limit, limit), ty: clamp(view.ty, -limit, limit) };
}

/** Zoom by `factor` keeping the screen point (px, py) still: pinch and wheel. */
export function zoomAt(view: View, size: Size, factor: number, px: number, py: number): View {
  const scale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
  const w = toWorld(view, size, px, py);
  const f = fit(size) * scale;
  return clampView({ scale, tx: px - size.width / 2 - w.x * f, ty: py - size.height / 2 - w.y * f }, size);
}

export function pan(view: View, size: Size, dx: number, dy: number): View {
  return clampView({ ...view, tx: view.tx + dx, ty: view.ty + dy }, size);
}

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export function clusterBounds(points: GalaxyPoint[], cluster: number): Bounds | null {
  let b: Bounds | null = null;
  for (const p of points) {
    if (p.cluster !== cluster) continue;
    b = b
      ? { minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y), maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y) }
      : { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };
  }
  return b;
}

/**
 * The view that centres a cluster and fits its members, with `padding` (0..1) of the
 * viewport left around them. A single-dot cluster zooms in to MAX_SCALE / 2.
 */
export function zoomToCluster(points: GalaxyPoint[], cluster: number, size: Size, padding = 0.25): View {
  const b = clusterBounds(points, cluster);
  if (!b) return HOME;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const spanX = b.maxX - b.minX;
  const spanY = b.maxY - b.minY;
  const f = fit(size);
  const usable = 1 - padding;
  const sx = spanX > 0 ? (size.width * usable) / (spanX * f) : Infinity;
  const sy = spanY > 0 ? (size.height * usable) / (spanY * f) : Infinity;
  let scale = Math.min(sx, sy);
  if (!Number.isFinite(scale)) scale = MAX_SCALE / 2;
  scale = clamp(scale, MIN_SCALE, MAX_SCALE);
  // Put (cx, cy) at the viewport centre: centre + c * f * scale + t = centre.
  return { scale, tx: -cx * f * scale, ty: -cy * f * scale };
}

/** The nearest dot within `radius` screen pixels of (sx, sy), or null. */
export function hitTest(points: GalaxyPoint[], view: View, size: Size, sx: number, sy: number, radius = 24): GalaxyPoint | null {
  let best: GalaxyPoint | null = null;
  let bestD = radius * radius;
  for (const p of points) {
    const s = toScreen(view, size, p.x, p.y);
    const d = (s.x - sx) ** 2 + (s.y - sy) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** The cluster whose centre is nearest to (sx, sy) on screen, within `radius` pixels. */
export function nearestCluster(clusters: GalaxyCluster[], view: View, size: Size, sx: number, sy: number, radius = 72): GalaxyCluster | null {
  let best: GalaxyCluster | null = null;
  let bestD = radius * radius;
  for (const c of clusters) {
    const s = toScreen(view, size, c.cx, c.cy);
    const d = (s.x - sx) ** 2 + (s.y - sy) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** Linear interpolation between two views (animated zoom), t in 0..1, eased. */
export function lerpView(a: View, b: View, t: number): View {
  const e = 1 - (1 - clamp(t, 0, 1)) ** 3; // ease-out cubic
  return { scale: a.scale + (b.scale - a.scale) * e, tx: a.tx + (b.tx - a.tx) * e, ty: a.ty + (b.ty - a.ty) * e };
}
