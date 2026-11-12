import { describe, expect, it } from "vitest";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  canvasToScreen,
  fitRect,
  panBy,
  pinchFactor,
  screenToCanvas,
  wheelToZoomFactor,
  zoomAt,
  type Camera,
} from "@/lib/engine/geometry/camera";

const VP = { w: 1440, h: 900 };

function finiteCam(c: Camera) {
  expect(Number.isFinite(c.x)).toBe(true);
  expect(Number.isFinite(c.y)).toBe(true);
  expect(Number.isFinite(c.z)).toBe(true);
  expect(c.z).toBeGreaterThanOrEqual(MIN_ZOOM);
  expect(c.z).toBeLessThanOrEqual(MAX_ZOOM);
}

describe("camera transforms", () => {
  it("has the documented zoom range", () => {
    expect(MIN_ZOOM).toBe(0.02);
    expect(MAX_ZOOM).toBe(32);
  });

  it("screenToCanvas and canvasToScreen are inverses", () => {
    const c: Camera = { x: 120, y: -80, z: 2.5 };
    const p = { x: 333, y: 444 };
    const back = screenToCanvas(c, canvasToScreen(c, p));
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
    expect(canvasToScreen(c, { x: 120, y: -80 })).toEqual({ x: 0, y: 0 });
  });

  it("panBy moves by screen pixels regardless of zoom", () => {
    const c = panBy({ x: 0, y: 0, z: 2 }, 100, -50);
    expect(c).toEqual({ x: -50, y: 25, z: 2 });
    // content follows the pointer: a canvas point stays under the same moved screen point
    const before = canvasToScreen({ x: 0, y: 0, z: 2 }, { x: 10, y: 10 });
    const after = canvasToScreen(c, { x: 10, y: 10 });
    expect(after.x - before.x).toBeCloseTo(100, 9);
    expect(after.y - before.y).toBeCloseTo(-50, 9);
  });
});

describe("zoomAt", () => {
  it("keeps the anchor screen point fixed", () => {
    const c: Camera = { x: 37, y: -12, z: 0.7 };
    const anchor = { x: 640, y: 300 };
    const canvasPt = screenToCanvas(c, anchor);
    for (const f of [0.5, 0.9, 1.1, 1.7, 2]) {
      const n = zoomAt(c, anchor, f);
      const s = canvasToScreen(n, canvasPt);
      expect(s.x).toBeCloseTo(anchor.x, 9);
      expect(s.y).toBeCloseTo(anchor.y, 9);
    }
  });

  it("clamps to [0.02, 32] and still keeps the anchor fixed when clamped", () => {
    const c: Camera = { x: 5, y: 6, z: 30 };
    const anchor = { x: 100, y: 200 };
    const canvasPt = screenToCanvas(c, anchor);
    const up = zoomAt(c, anchor, 100);
    expect(up.z).toBe(MAX_ZOOM);
    expect(canvasToScreen(up, canvasPt).x).toBeCloseTo(anchor.x, 9);
    const down = zoomAt({ x: 0, y: 0, z: 0.03 }, anchor, 1e-6);
    expect(down.z).toBe(MIN_ZOOM);
  });

  it("ignores nonsense factors", () => {
    const c: Camera = { x: 1, y: 2, z: 1 };
    for (const f of [NaN, Infinity, -Infinity, 0, -3]) {
      const n = zoomAt(c, { x: 10, y: 10 }, f);
      finiteCam(n);
      expect(n.z).toBe(1);
    }
  });

  it("never yields NaN/Infinity for extreme coordinates or anchors", () => {
    const c: Camera = { x: 1e7, y: -1e7, z: 1 };
    const n = zoomAt(c, { x: 1e9, y: -1e9 }, 2);
    finiteCam(n);
    finiteCam(zoomAt({ x: 0, y: 0, z: 1 }, { x: NaN, y: Infinity }, 2));
  });
});

describe("fitRect", () => {
  it("returns the home camera for an empty board", () => {
    expect(fitRect(null, VP)).toEqual({ x: 0, y: 0, z: 1 });
  });

  it("fits a normal rect with padding and centres it", () => {
    const r = { x: 100, y: 100, w: 2000, h: 1000 };
    const c = fitRect(r, VP, 64, 1);
    finiteCam(c);
    const tl = canvasToScreen(c, { x: r.x, y: r.y });
    const br = canvasToScreen(c, { x: r.x + r.w, y: r.y + r.h });
    expect(tl.x).toBeGreaterThanOrEqual(64 - 1e-9);
    expect(tl.y).toBeGreaterThanOrEqual(64 - 1e-9);
    expect(br.x).toBeLessThanOrEqual(VP.w - 64 + 1e-9);
    expect(br.y).toBeLessThanOrEqual(VP.h - 64 + 1e-9);
    expect(tl.x + br.x).toBeCloseTo(VP.w, 6); // centred
    expect(tl.y + br.y).toBeCloseTo(VP.h, 6);
  });

  it("does not zoom in past maxZoom for small content", () => {
    expect(fitRect({ x: 0, y: 0, w: 10, h: 10 }, VP).z).toBe(1);
    expect(fitRect({ x: 0, y: 0, w: 10, h: 10 }, VP, 64, 4).z).toBe(4);
  });

  it("handles 10^7-wide content", () => {
    const c = fitRect({ x: -5e6, y: 0, w: 1e7, h: 10 }, VP);
    finiteCam(c);
    expect(c.z).toBeGreaterThanOrEqual(MIN_ZOOM);
  });

  it("handles 10^7 coordinates", () => {
    finiteCam(fitRect({ x: 1e7, y: -1e7, w: 100, h: 100 }, VP));
    finiteCam(fitRect({ x: 1e12, y: 1e12, w: 1e12, h: 1e12 }, VP));
  });

  it("handles zero-size rects and zero-size viewports without NaN", () => {
    finiteCam(fitRect({ x: 5, y: 5, w: 0, h: 0 }, VP));
    finiteCam(fitRect({ x: 5, y: 5, w: 0, h: 100 }, VP));
    finiteCam(fitRect({ x: 5, y: 5, w: 100, h: 100 }, { w: 0, h: 0 }));
    finiteCam(fitRect({ x: 5, y: 5, w: 100, h: 100 }, { w: 100, h: 100 }, 64)); // padding eats the viewport
    finiteCam(fitRect({ x: 5, y: 5, w: 100, h: 100 }, VP, -10));
  });

  it("falls back to home for non-finite rects", () => {
    expect(fitRect({ x: NaN, y: 0, w: 10, h: 10 }, VP)).toEqual({ x: 0, y: 0, z: 1 });
    expect(fitRect({ x: 0, y: 0, w: Infinity, h: 10 }, VP)).toEqual({ x: 0, y: 0, z: 1 });
  });
});

describe("wheelToZoomFactor", () => {
  it("clamps huge deltas to [0.5, 2] per event", () => {
    expect(wheelToZoomFactor(10000, 0, 1)).toBe(0.5);
    expect(wheelToZoomFactor(-10000, 0, 1)).toBe(2);
  });

  it("is 1 at rest and monotonic", () => {
    expect(wheelToZoomFactor(0, 0, 1)).toBe(1);
    expect(wheelToZoomFactor(-10, 0, 1)).toBeGreaterThan(1);
    expect(wheelToZoomFactor(10, 0, 1)).toBeLessThan(1);
    expect(wheelToZoomFactor(-10, 0, 2)).toBeGreaterThan(wheelToZoomFactor(-10, 0, 1));
  });

  it("scales line and page delta modes up", () => {
    expect(wheelToZoomFactor(-3, 1, 1)).toBeGreaterThan(wheelToZoomFactor(-3, 0, 1));
    expect(wheelToZoomFactor(-1, 2, 1)).toBeGreaterThan(wheelToZoomFactor(-1, 1, 1));
  });

  it("never returns NaN for odd inputs", () => {
    for (const d of [NaN, Infinity, -Infinity]) {
      const f = wheelToZoomFactor(d, 0, 1);
      expect(Number.isFinite(f)).toBe(true);
      expect(f).toBeGreaterThanOrEqual(0.5);
      expect(f).toBeLessThanOrEqual(2);
    }
    expect(Number.isFinite(wheelToZoomFactor(10, 0, NaN))).toBe(true);
    expect(Number.isFinite(wheelToZoomFactor(10, 7, 1))).toBe(true);
    expect(wheelToZoomFactor(1e300, 2, 1e300)).toBe(0.5);
  });
});

describe("pinchFactor", () => {
  it("is the clamped ratio of distances", () => {
    expect(pinchFactor(100, 120)).toBeCloseTo(1.2, 9);
    expect(pinchFactor(100, 1000)).toBe(2);
    expect(pinchFactor(100, 1)).toBe(0.5);
  });

  it("survives a pinch to zero distance", () => {
    expect(pinchFactor(100, 0)).toBe(0.5);
    expect(pinchFactor(0, 100)).toBe(1);
    expect(pinchFactor(0, 0)).toBe(1);
    expect(pinchFactor(NaN, 5)).toBe(1);
    expect(pinchFactor(5, Infinity)).toBe(1);
  });
});

describe("a long sequence of extreme gestures", () => {
  it("never leaves the valid range or produces NaN", () => {
    let c: Camera = { x: 0, y: 0, z: 1 };
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
    for (let i = 0; i < 2000; i++) {
      c = zoomAt(c, { x: rnd() * 2000, y: rnd() * 2000 }, wheelToZoomFactor(rnd() * 20000, 0, 1));
      c = panBy(c, rnd() * 1e5, rnd() * 1e5);
      finiteCam(c);
    }
  });
});
