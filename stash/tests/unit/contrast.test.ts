import { describe, expect, it } from "vitest";
import { clashingSpaces, colorDistance, contrastRatio, parseHex, pickOnAccent } from "@/lib/theme/contrast";

// Values mirror styles/tokens.css (tests may hold literals; components may not).
const INK_DARK = "#0e0e10";
const INK_LIGHT = "#f6f4ef";

describe("contrast", () => {
  it("parses 3 and 6 digit hex", () => {
    expect(parseHex("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex("c8f05a")).toEqual({ r: 200, g: 240, b: 90 });
    expect(parseHex("nope")).toBeNull();
  });

  it("matches WCAG extremes", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });

  it("picks dark ink on every light preset and it passes 4.5:1", () => {
    for (const accent of ["#c8f05a", "#ff7a59", "#6cc4ff", "#f5c542"]) {
      const r = pickOnAccent(accent, INK_DARK, INK_LIGHT);
      expect(r.ink).toBe(INK_DARK);
      expect(r.passes).toBe(true);
    }
  });

  it("picks light ink on a dark custom accent", () => {
    const r = pickOnAccent("#1a237e", INK_DARK, INK_LIGHT);
    expect(r.ink).toBe(INK_LIGHT);
    expect(r.passes).toBe(true);
  });

  it("flags a mid-grey accent where neither ink passes", () => {
    const r = pickOnAccent("#767676", "#555555", "#999999");
    expect(r.passes).toBe(false);
  });

  it("warns when the accent is close to a Space colour", () => {
    const spaces = { violet: "#b79cff", teal: "#5fd4c0", green: "#8ed47a" };
    expect(clashingSpaces("#b89dfe", spaces)).toEqual(["violet"]);
    expect(clashingSpaces("#c8f05a", spaces)).toEqual([]);
    expect(colorDistance("#000000", "#000000")).toBe(0);
  });
});
