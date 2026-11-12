import { describe, expect, it, vi } from "vitest";
import { CameraStore, easeInOut, interpolateCamera, sanitizeCamera } from "@/lib/engine/input/camera-store";
import { MAX_ZOOM, MIN_ZOOM } from "@/lib/engine/geometry/camera";

describe("sanitizeCamera", () => {
  it("clamps zoom and replaces non-finite values", () => {
    expect(sanitizeCamera({ x: 5, y: 6, z: 1e9 })).toEqual({ x: 5, y: 6, z: MAX_ZOOM });
    expect(sanitizeCamera({ x: 5, y: 6, z: 0 })).toEqual({ x: 5, y: 6, z: MIN_ZOOM });
    expect(sanitizeCamera({ x: NaN, y: Infinity, z: NaN })).toEqual({ x: 0, y: 0, z: 1 });
  });
});

describe("CameraStore", () => {
  it("holds a sanitised camera and notifies subscribers on change only", () => {
    const store = new CameraStore({ x: 0, y: 0, z: 1 });
    const cb = vi.fn();
    const off = store.subscribe(cb);
    store.set({ x: 10, y: 0, z: 2 });
    expect(store.get()).toEqual({ x: 10, y: 0, z: 2 });
    expect(cb).toHaveBeenCalledTimes(1);
    store.set({ x: 10, y: 0, z: 2 });
    expect(cb).toHaveBeenCalledTimes(1);
    store.set({ x: NaN, y: 0, z: -3 });
    expect(Number.isFinite(store.get().x)).toBe(true);
    off();
    store.set({ x: 99, y: 0, z: 1 });
    expect(cb).toHaveBeenCalledTimes(2);
  });
});

describe("interpolateCamera", () => {
  const vp = { w: 1000, h: 800 };
  const a = { x: 0, y: 0, z: 1 };
  const b = { x: 4000, y: -2000, z: 0.1 };

  it("starts at the source, ends at the target and stays finite and in range", () => {
    expect(interpolateCamera(a, b, vp, 0)).toEqual(a);
    const end = interpolateCamera(a, b, vp, 1);
    expect(end.x).toBeCloseTo(b.x, 6);
    expect(end.y).toBeCloseTo(b.y, 6);
    expect(end.z).toBeCloseTo(b.z, 9);
    for (let t = 0; t <= 1; t += 0.05) {
      const c = interpolateCamera(a, b, vp, t);
      expect([c.x, c.y, c.z].every(Number.isFinite)).toBe(true);
      expect(c.z).toBeGreaterThanOrEqual(MIN_ZOOM);
      expect(c.z).toBeLessThanOrEqual(MAX_ZOOM);
    }
  });

  it("moves the view centre along a straight line (zoom is interpolated geometrically)", () => {
    const mid = interpolateCamera(a, b, vp, 0.5);
    const centre = (c: { x: number; y: number; z: number }) => ({ x: c.x + vp.w / 2 / c.z, y: c.y + vp.h / 2 / c.z });
    const c0 = centre(a);
    const c1 = centre(b);
    const cm = centre(mid);
    expect(cm.x).toBeCloseTo((c0.x + c1.x) / 2, 6);
    expect(cm.y).toBeCloseTo((c0.y + c1.y) / 2, 6);
    expect(mid.z).toBeCloseTo(Math.sqrt(a.z * b.z), 9);
  });

  it("easeInOut is monotonic from 0 to 1", () => {
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const v = easeInOut(Math.min(t, 1));
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
  });
});
