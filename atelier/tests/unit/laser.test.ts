import { describe, expect, it } from "vitest";
import { LASER_FADE_MS, LASER_MAX_POINTS, LaserTrail } from "@/lib/engine/present/laser";

describe("LaserTrail", () => {
  it("a point is fully visible when added and fades to nothing over 600 ms", () => {
    expect(LASER_FADE_MS).toBe(600);
    const t = new LaserTrail();
    t.add({ x: 10, y: 20 }, 1000);
    expect(t.points(1000)).toEqual([{ x: 10, y: 20, alpha: 1 }]);
    expect(t.points(1300)[0].alpha).toBeCloseTo(0.5, 9);
    expect(t.points(1599)[0].alpha).toBeGreaterThan(0);
    expect(t.points(1600)).toEqual([]);
    expect(t.points(5000)).toEqual([]);
  });

  it("returns oldest first and drops the faded ones", () => {
    const t = new LaserTrail();
    t.add({ x: 0, y: 0 }, 0);
    t.add({ x: 1, y: 1 }, 400);
    t.add({ x: 2, y: 2 }, 800);
    const p = t.points(700);
    expect(p.map((q) => q.x)).toEqual([1, 2]);
    expect(p[0].alpha).toBeLessThan(p[1].alpha);
  });

  it("keeps at most 64 points", () => {
    expect(LASER_MAX_POINTS).toBe(64);
    const t = new LaserTrail();
    for (let i = 0; i < 200; i++) t.add({ x: i, y: 0 }, 10);
    const p = t.points(10);
    expect(p).toHaveLength(64);
    expect(p[0].x).toBe(136);
    expect(p[63].x).toBe(199);
  });

  it("clear() empties it and an empty trail reports it", () => {
    const t = new LaserTrail();
    expect(t.empty(0)).toBe(true);
    t.add({ x: 1, y: 1 }, 0);
    expect(t.empty(10)).toBe(false);
    expect(t.empty(10_000)).toBe(true);
    t.add({ x: 1, y: 1 }, 0);
    t.clear();
    expect(t.points(0)).toEqual([]);
  });

  it("ignores non-finite points", () => {
    const t = new LaserTrail();
    t.add({ x: NaN, y: 1 }, 0);
    t.add({ x: 1, y: Infinity }, 0);
    expect(t.points(0)).toEqual([]);
  });
});
