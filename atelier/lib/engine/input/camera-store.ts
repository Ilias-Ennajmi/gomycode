import { clampZoom, type Camera } from "../geometry/camera";

/** Finite coordinates, zoom clamped to the allowed range. */
export function sanitizeCamera(c: Camera): Camera {
  return {
    x: Number.isFinite(c.x) ? c.x : 0,
    y: Number.isFinite(c.y) ? c.y : 0,
    z: clampZoom(Number.isFinite(c.z) ? c.z : 1),
  };
}

/** The live camera. Written directly to the DOM by the canvas, so it is not React state. */
export class CameraStore {
  private cam: Camera;
  private readonly listeners = new Set<(c: Camera) => void>();

  constructor(initial: Camera = { x: 0, y: 0, z: 1 }) {
    this.cam = sanitizeCamera(initial);
  }

  get(): Camera {
    return this.cam;
  }

  set(next: Camera): void {
    const c = sanitizeCamera(next);
    if (c.x === this.cam.x && c.y === this.cam.y && c.z === this.cam.z) return;
    this.cam = c;
    for (const cb of [...this.listeners]) cb(c);
  }

  subscribe(cb: (c: Camera) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }
}

export function easeInOut(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/**
 * Camera at progress `t` (0..1) between two cameras: the view centre moves in a straight line while the zoom
 * changes geometrically, so a zoom-to-fit reads as one smooth move.
 */
export function interpolateCamera(from: Camera, to: Camera, viewport: { w: number; h: number }, t: number): Camera {
  const a = sanitizeCamera(from);
  const b = sanitizeCamera(to);
  const k = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 1));
  if (k === 0) return a;
  if (k === 1) return b;
  const vw = Math.max(viewport.w, 1);
  const vh = Math.max(viewport.h, 1);
  const z = clampZoom(a.z * (b.z / a.z) ** k);
  const c0 = { x: a.x + vw / 2 / a.z, y: a.y + vh / 2 / a.z };
  const c1 = { x: b.x + vw / 2 / b.z, y: b.y + vh / 2 / b.z };
  const cx = c0.x + (c1.x - c0.x) * k;
  const cy = c0.y + (c1.y - c0.y) * k;
  return sanitizeCamera({ x: cx - vw / 2 / z, y: cy - vh / 2 / z, z });
}
