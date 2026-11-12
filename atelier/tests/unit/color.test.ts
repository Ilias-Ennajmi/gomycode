import { describe, expect, it } from "vitest";
import {
  deltaE,
  formatColor,
  hexToOklab,
  hexToRgb,
  normalizeHex,
  oklabToHex,
  rgbToHex,
} from "@/lib/engine/model/color";

function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("hexToRgb / rgbToHex", () => {
  it("parses #rgb and #rrggbb, case-insensitively", () => {
    expect(hexToRgb("#fff")).toEqual([255, 255, 255]);
    expect(hexToRgb("#F0a")).toEqual([255, 0, 170]);
    expect(hexToRgb("#2F4A6D")).toEqual([47, 74, 109]);
    expect(hexToRgb("#2f4a6d")).toEqual([47, 74, 109]);
  });
  it("rejects everything else", () => {
    for (const bad of ["red", "fff", "#ff", "#ffff", "#fffffff", "#ggg", "", "rgb(0,0,0)", "#12345g", " #fff"]) {
      expect(hexToRgb(bad)).toBeNull();
    }
    expect(hexToRgb(undefined as unknown as string)).toBeNull();
  });
  it("rgbToHex clamps and rounds to lower-case #rrggbb", () => {
    expect(rgbToHex(300, -4, 0)).toBe("#ff0000");
    expect(rgbToHex(47.4, 74.6, 109)).toBe("#2f4b6d");
    expect(rgbToHex(Number.NaN, 0, 0)).toBe("#000000");
  });
  it("normalizeHex returns lower-case #rrggbb or null", () => {
    expect(normalizeHex("#FFF")).toBe("#ffffff");
    expect(normalizeHex("#2F4A6D")).toBe("#2f4a6d");
    expect(normalizeHex("red")).toBeNull();
  });
});

describe("OKLab", () => {
  it("round-trips 50 random colours exactly", () => {
    const rnd = mulberry(7);
    for (let i = 0; i < 50; i++) {
      const hex = rgbToHex(rnd() * 255, rnd() * 255, rnd() * 255);
      const [l, a, b] = hexToOklab(hex);
      expect(oklabToHex(l, a, b)).toBe(hex);
    }
  });
  it("round-trips the corners", () => {
    for (const hex of ["#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#808080"]) {
      expect(oklabToHex(...hexToOklab(hex))).toBe(hex);
    }
  });
  it("white is L=1, black is L=0, greys have no chroma", () => {
    const [lw, aw, bw] = hexToOklab("#ffffff");
    expect(lw).toBeCloseTo(1, 3);
    expect(Math.abs(aw)).toBeLessThan(1e-3);
    expect(Math.abs(bw)).toBeLessThan(1e-3);
    expect(hexToOklab("#000000")).toEqual([0, 0, 0]);
  });
  it("an unparseable colour reads as black rather than throwing", () => {
    expect(hexToOklab("nope")).toEqual([0, 0, 0]);
  });
  it("oklabToHex clamps out-of-gamut values", () => {
    expect(oklabToHex(2, 0, 0)).toBe("#ffffff");
    expect(oklabToHex(-1, 0, 0)).toBe("#000000");
    expect(oklabToHex(Number.NaN, 0, 0)).toBe("#000000");
  });
});

describe("deltaE", () => {
  it("is 0 for identical colours and about 1 for black vs white", () => {
    const c = hexToOklab("#2f4a6d");
    expect(deltaE(c, c)).toBe(0);
    expect(deltaE(hexToOklab("#000000"), hexToOklab("#ffffff"))).toBeCloseTo(1, 2);
  });
  it("is symmetric", () => {
    const a = hexToOklab("#ff0000");
    const b = hexToOklab("#0000ff");
    expect(deltaE(a, b)).toBeCloseTo(deltaE(b, a), 12);
  });
});

describe("formatColor", () => {
  it("formats hex, rgb and oklch", () => {
    expect(formatColor("#2F4A6D", "hex")).toBe("#2f4a6d");
    expect(formatColor("#2F4A6D", "rgb")).toBe("rgb(47 74 109)");
    expect(formatColor("#2F4A6D", "oklch")).toBe("oklch(0.40 0.07 255)");
  });
  it("greys have chroma 0 and hue 0", () => {
    expect(formatColor("#ffffff", "oklch")).toBe("oklch(1.00 0.00 0)");
    expect(formatColor("#000", "oklch")).toBe("oklch(0.00 0.00 0)");
  });
  it("falls back to the input for an invalid colour", () => {
    expect(formatColor("red", "rgb")).toBe("red");
  });
});
