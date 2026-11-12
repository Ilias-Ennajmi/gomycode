import { describe, expect, it } from "vitest";
import { computeSnap, type Guide } from "@/lib/engine/geometry/snap";

const r = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const align = (gs: Guide[]) => gs.filter((g) => g.gap === undefined);
const gaps = (gs: Guide[]) => gs.filter((g) => g.gap !== undefined);

describe("computeSnap", () => {
  it("aligns left edges within the threshold and reports the guide spanning both boxes", () => {
    const res = computeSnap(r(103, 300, 50, 50), [r(100, 0, 80, 80)], 6);
    expect(res.dx).toBeCloseTo(-3);
    expect(res.dy).toBe(0);
    const g = align(res.guides).find((g) => g.axis === "x");
    expect(g).toEqual({ axis: "x", pos: 100, from: 0, to: 350 });
  });

  it("aligns right edges and top / bottom edges", () => {
    const res = computeSnap(r(48, 202, 50, 50), [r(0, 0, 100, 200)], 6);
    expect(res.dx).toBeCloseTo(2); // right 98 -> 100
    expect(res.dy).toBeCloseTo(-2); // top 202 -> 200 (bottom of the other)
  });

  it("aligns centres", () => {
    const res = computeSnap(r(124, 500, 52, 40), [r(100, 0, 100, 100)], 6); // centre 150 vs 150
    expect(res.dx).toBeCloseTo(0);
    const res2 = computeSnap(r(127, 500, 52, 40), [r(100, 0, 100, 100)], 6); // centre 153
    expect(res2.dx).toBeCloseTo(-3);
    expect(align(res2.guides).some((g) => g.axis === "x" && g.pos === 150)).toBe(true);
  });

  it("returns no snap and no guides outside the threshold", () => {
    const res = computeSnap(r(110, 110, 30, 30), [r(300, 300, 80, 80)], 6);
    expect(res).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it("picks the nearest of several candidates and snaps both axes independently", () => {
    const res = computeSnap(r(103, 51, 50, 50), [r(100, 0, 20, 20), r(105, 50, 20, 20)], 6);
    // x: left edges 100 (d -3) and 105 (d +2) -> +2; y: top 50 (d -1)
    expect(res.dx).toBeCloseTo(2);
    expect(res.dy).toBeCloseTo(-1);
  });

  it("snaps to equal gaps between three boxes (moving box in the middle)", () => {
    const a = r(0, 0, 100, 100);
    const b = r(300, 0, 100, 100);
    const res = computeSnap(r(172, 20, 50, 50), [a, b], 6);
    // gaps are 72 and 78 -> shift +3 so both are 75
    expect(res.dx).toBeCloseTo(3);
    const g = gaps(res.guides);
    expect(g).toHaveLength(2);
    expect(g.every((x) => x.gap !== undefined && Math.abs(x.gap - 75) < 1e-6)).toBe(true);
    expect(g.every((x) => x.axis === "y")).toBe(true); // horizontal measure lines: pos is a y
    const spans = g.map((x) => [x.from, x.to]).sort((p, q) => p[0] - q[0]);
    expect(spans[0][0]).toBeCloseTo(100);
    expect(spans[0][1]).toBeCloseTo(175);
    expect(spans[1][0]).toBeCloseTo(225);
    expect(spans[1][1]).toBeCloseTo(300);
  });

  it("snaps to the same gap as an existing pair when placed after or before it", () => {
    const a = r(0, 0, 100, 100);
    const b = r(200, 0, 100, 100); // gap 100
    const after = computeSnap(r(405, 10, 60, 60), [a, b], 6);
    expect(after.dx).toBeCloseTo(-5); // left edge to 400
    expect(gaps(after.guides).filter((g) => Math.abs(g.gap! - 100) < 1e-6)).toHaveLength(2);
    const before = computeSnap(r(-165, 10, 60, 60), [a, b], 6);
    expect(before.dx).toBeCloseTo(5); // right edge to -100 => x=-160
    expect(gaps(before.guides).length).toBeGreaterThanOrEqual(2);
  });

  it("equal spacing works vertically too", () => {
    const a = r(0, 0, 100, 100);
    const b = r(0, 300, 100, 100);
    const res = computeSnap(r(20, 172, 50, 50), [a, b], 6);
    expect(res.dy).toBeCloseTo(3);
    expect(gaps(res.guides).every((g) => g.axis === "x")).toBe(true);
  });

  it("only boxes that share a row take part in equal spacing", () => {
    const res = computeSnap(r(172, 900, 50, 50), [r(0, 0, 100, 100), r(300, 0, 100, 100)], 6);
    expect(res.dx).toBe(0);
  });

  it("prefers the closer of an edge alignment and an equal gap", () => {
    // gap snap wants +3, left edge of a third box wants +1
    const res = computeSnap(r(172, 20, 50, 50), [r(0, 0, 100, 100), r(300, 0, 100, 100), r(173, 400, 10, 10)], 6);
    expect(res.dx).toBeCloseTo(1);
  });

  it("never returns NaN, even for degenerate input", () => {
    const bad = computeSnap(r(NaN, 0, 10, 10), [r(0, 0, 10, 10)], 6);
    expect(bad).toEqual({ dx: 0, dy: 0, guides: [] });
    expect(computeSnap(r(0, 0, 10, 10), [r(Infinity, 0, 1, 1), r(0, 0, 10, 10)], 6).dx).toBe(0);
    expect(computeSnap(r(3, 0, 10, 10), [r(0, 0, 10, 10)], 0)).toEqual({ dx: 0, dy: 0, guides: [] });
    expect(computeSnap(r(3, 0, 10, 10), [], 6)).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it("is fast enough for dragging against 60 neighbours", () => {
    const others = Array.from({ length: 60 }, (_, i) => r((i % 10) * 130, Math.floor(i / 10) * 130, 100, 100));
    const t = performance.now();
    for (let i = 0; i < 200; i++) computeSnap(r(333 + i * 0.1, 247, 100, 100), others, 6);
    expect((performance.now() - t) / 200).toBeLessThan(2);
  });
});
