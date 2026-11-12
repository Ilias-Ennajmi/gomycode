import { describe, expect, it } from "vitest";
import { apply, cmdBounds, ellipseCmds, multiply, parsePathD, rotateAbout, roundRectCmds, scaling, transformCmds, translation } from "@/lib/engine/export/path-cmds";

describe("parsePathD", () => {
  it("reads absolute and relative lines, h and v, and close", () => {
    expect(parsePathD("M 10 10 L 20 10 h 5 v 5 l -5 0 Z")).toEqual([["M", 10, 10], ["L", 20, 10], ["L", 25, 10], ["L", 25, 15], ["L", 20, 15], ["Z"]]);
  });
  it("turns a quadratic curve into the equivalent cubic", () => {
    const [, c] = parsePathD("M 0 0 Q 50 100 100 0");
    expect(c[0]).toBe("C");
    expect(c.slice(1)).toEqual([100 / 3, 200 / 3, 200 / 3, 200 / 3, 100, 0].map((v) => expect.closeTo(v as number, 6)));
  });
  it("treats extra coordinate pairs after M as line-tos", () => {
    expect(parsePathD("M 0 0 10 0 10 10").map((c) => c[0])).toEqual(["M", "L", "L"]);
  });
  it("converts the arc of a dot arrow head into cubics that end where the arc ends", () => {
    const cmds = parsePathD("M 0 5 a 5 5 0 1 0 10 0 a 5 5 0 1 0 -10 0 Z");
    const cubics = cmds.filter((c) => c[0] === "C");
    expect(cubics.length).toBeGreaterThanOrEqual(4);
    const last = cubics[cubics.length - 1] as number[];
    expect(last[5]).toBeCloseTo(0, 6);
    expect(last[6]).toBeCloseTo(5, 6);
    const b = cmdBounds(cmds)!;
    expect(b.w).toBeGreaterThan(9);
    expect(b.h).toBeGreaterThan(9);
  });
  it("never throws on hostile data and keeps what it could read", () => {
    expect(parsePathD("M 0 0 L <script> 5")).toEqual([["M", 0, 0]]);
    expect(parsePathD("")).toEqual([]);
    expect(parsePathD("L 1 2")).toEqual([["L", 1, 2]]);
    expect(() => parsePathD("M 1e999 1e999 L NaN")).not.toThrow();
  });
});

describe("shapes and matrices", () => {
  it("builds a rounded rectangle whose bounds are the rectangle", () => {
    expect(cmdBounds(roundRectCmds(10, 20, 100, 50, 12))).toEqual({ x: 10, y: 20, w: 100, h: 50 });
    expect(roundRectCmds(0, 0, 10, 10, 0).map((c) => c[0])).toEqual(["M", "L", "L", "L", "Z"]);
    expect(roundRectCmds(0, 0, 10, 4, 99).filter((c) => c[0] === "C")).toHaveLength(4); // radius clamped
  });
  it("builds an ellipse of four cubics", () => {
    const b = cmdBounds(ellipseCmds(0, 0, 100, 50))!;
    expect(b.w).toBeCloseTo(100, 6);
    expect(b.h).toBeCloseTo(50, 6);
  });
  it("rotates about a point and composes", () => {
    const p = apply(rotateAbout(Math.PI / 2, 10, 10), 20, 10);
    expect(p.x).toBeCloseTo(10, 9);
    expect(p.y).toBeCloseTo(20, 9);
    const m = multiply(scaling(2), translation(5, 0));
    expect(apply(m, 1, 1)).toEqual({ x: 12, y: 2 });
    expect(transformCmds([["M", 1, 1], ["Z"]], scaling(3))).toEqual([["M", 3, 3], ["Z"]]);
  });
});
