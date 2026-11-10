import { describe, expect, it } from "vitest";
import {
  HOME,
  MAX_SCALE,
  clampView,
  hitTest,
  lerpView,
  nearestCluster,
  pan,
  toScreen,
  toWorld,
  zoomAt,
  zoomToCluster,
  type GalaxyPoint,
} from "@/lib/galaxyMath";

const size = { width: 360, height: 360 };
const points: GalaxyPoint[] = [
  { saveId: "a", x: 0.5, y: 0.5, cluster: 0 },
  { saveId: "b", x: 0.7, y: 0.6, cluster: 0 },
  { saveId: "c", x: 0.6, y: 0.4, cluster: 0 },
  { saveId: "d", x: -0.6, y: -0.5, cluster: 1 },
  { saveId: "e", x: -0.9, y: 0.9, cluster: 2 },
];

describe("galaxy view math", () => {
  it("maps world to screen and back", () => {
    const view = { scale: 2.5, tx: 30, ty: -12 };
    const s = toScreen(view, size, 0.3, -0.7);
    const w = toWorld(view, size, s.x, s.y);
    expect(w.x).toBeCloseTo(0.3);
    expect(w.y).toBeCloseTo(-0.7);
    expect(toScreen(HOME, size, 0, 0)).toEqual({ x: 180, y: 180 });
  });

  it("zoom to a cluster centres it and fits every member inside the padded viewport", () => {
    const v = zoomToCluster(points, 0, size, 0.25);
    expect(v.scale).toBeGreaterThan(1);
    const centre = toScreen(v, size, 0.6, 0.5); // bbox centre of cluster 0
    expect(centre.x).toBeCloseTo(180);
    expect(centre.y).toBeCloseTo(180);
    for (const p of points.filter((q) => q.cluster === 0)) {
      const s = toScreen(v, size, p.x, p.y);
      expect(s.x).toBeGreaterThanOrEqual(360 * 0.125 - 1e-6);
      expect(s.x).toBeLessThanOrEqual(360 * 0.875 + 1e-6);
      expect(s.y).toBeGreaterThanOrEqual(360 * 0.125 - 1e-6);
      expect(s.y).toBeLessThanOrEqual(360 * 0.875 + 1e-6);
    }
  });

  it("a one-dot cluster zooms to half the maximum, centred on the dot", () => {
    const v = zoomToCluster(points, 1, size);
    expect(v.scale).toBe(MAX_SCALE / 2);
    const s = toScreen(v, size, -0.6, -0.5);
    expect(s.x).toBeCloseTo(180);
    expect(s.y).toBeCloseTo(180);
  });

  it("an unknown cluster goes home", () => {
    expect(zoomToCluster(points, 42, size)).toEqual(HOME);
  });

  it("pinch zoom keeps the point under the fingers still", () => {
    const v = zoomAt(HOME, size, 2, 250, 120);
    const before = toWorld(HOME, size, 250, 120);
    const after = toWorld(v, size, 250, 120);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(v.scale).toBe(2);
  });

  it("scale and pan are clamped", () => {
    expect(zoomAt(HOME, size, 100, 180, 180).scale).toBe(MAX_SCALE);
    expect(zoomAt(HOME, size, 0.01, 180, 180).scale).toBe(1);
    const far = pan(HOME, size, 10_000, -10_000);
    expect(far.tx).toBeCloseTo(162);
    expect(far.ty).toBeCloseTo(-162);
    expect(clampView({ scale: 0.2, tx: 0, ty: 0 }, size).scale).toBe(1);
  });

  it("taps find the nearest dot within the radius, else nothing", () => {
    const s = toScreen(HOME, size, 0.5, 0.5);
    expect(hitTest(points, HOME, size, s.x + 5, s.y - 5)?.saveId).toBe("a");
    expect(hitTest(points, HOME, size, 5, 350)).toBeNull();
  });

  it("taps near a label pick its cluster", () => {
    const clusters = [
      { cluster: 0, label: "Pricing", cx: 0.6, cy: 0.5, size: 3 },
      { cluster: 1, label: "Cafés", cx: -0.6, cy: -0.5, size: 1 },
    ];
    const s = toScreen(HOME, size, -0.6, -0.5);
    expect(nearestCluster(clusters, HOME, size, s.x + 20, s.y)?.label).toBe("Cafés");
    expect(nearestCluster(clusters, HOME, size, 180, 350)).toBeNull();
  });

  it("animation lands exactly on the target", () => {
    const target = { scale: 3, tx: -40, ty: 25 };
    expect(lerpView(HOME, target, 1)).toEqual(target);
    expect(lerpView(HOME, target, 0)).toEqual(HOME);
    expect(lerpView(HOME, target, 0.5).scale).toBeGreaterThan(2); // eased out: past the midpoint
  });
});
