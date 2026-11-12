import { describe, expect, it } from "vitest";
import { alignRects, distribute } from "@/lib/engine/layout/align";
import type { Rect } from "@/lib/engine/model/types";

const rs: Rect[] = [
  { x: 0, y: 0, w: 100, h: 50 },
  { x: 200, y: 40, w: 60, h: 20 },
  { x: 90, y: 300, w: 40, h: 80 },
];

describe("alignRects", () => {
  it("aligns left, right, hcenter to the union of the rects", () => {
    expect(alignRects(rs, "left").map((r) => r.x)).toEqual([0, 0, 0]);
    expect(alignRects(rs, "right").map((r) => r.x + r.w)).toEqual([260, 260, 260]);
    expect(alignRects(rs, "hcenter").map((r) => r.x + r.w / 2)).toEqual([130, 130, 130]);
  });

  it("aligns top, bottom, vcenter and never changes sizes", () => {
    expect(alignRects(rs, "top").map((r) => r.y)).toEqual([0, 0, 0]);
    expect(alignRects(rs, "bottom").map((r) => r.y + r.h)).toEqual([380, 380, 380]);
    expect(alignRects(rs, "vcenter").map((r) => r.y + r.h / 2)).toEqual([190, 190, 190]);
    for (const m of ["left", "hcenter", "right", "top", "vcenter", "bottom"] as const) {
      expect(alignRects(rs, m).map((r) => [r.w, r.h])).toEqual(rs.map((r) => [r.w, r.h]));
    }
  });

  it("does not mutate the input, and aligns to a given target rect", () => {
    const before = JSON.stringify(rs);
    alignRects(rs, "left");
    expect(JSON.stringify(rs)).toBe(before);
    const to = { x: -50, y: -50, w: 500, h: 500 };
    expect(alignRects([rs[0]], "left", to)[0].x).toBe(-50);
    expect(alignRects([rs[0]], "hcenter", to)[0].x).toBe(150);
  });

  it("handles empty input", () => {
    expect(alignRects([], "left")).toEqual([]);
  });
});

describe("distribute", () => {
  it("makes the gaps equal along x, keeping the outer two in place", () => {
    const boxes: Rect[] = [
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 20, y: 0, w: 30, h: 10 },
      { x: 100, y: 0, w: 20, h: 10 },
    ];
    const out = distribute(boxes, "x");
    expect(out[0].x).toBe(0);
    expect(out[2].x).toBe(100);
    // free space = 120 - 60 = 60, two gaps of 30
    expect(out[1].x).toBe(10 + 30);
    expect(out[1].x - (out[0].x + out[0].w)).toBe(out[2].x - (out[1].x + out[1].w));
  });

  it("works along y, in any input order", () => {
    const boxes: Rect[] = [
      { x: 0, y: 200, w: 10, h: 20 },
      { x: 0, y: 0, w: 10, h: 20 },
      { x: 0, y: 30, w: 10, h: 20 },
    ];
    const out = distribute(boxes, "y");
    expect(out[1].y).toBe(0);
    expect(out[0].y).toBe(200);
    expect(out[2].y).toBe(100); // span 220, sizes 60, two gaps of 80
  });

  it("leaves fewer than three rects untouched", () => {
    expect(distribute([rs[0], rs[1]], "x")).toEqual([rs[0], rs[1]]);
    expect(distribute([], "y")).toEqual([]);
  });
});
