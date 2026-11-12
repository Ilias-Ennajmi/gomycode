import { describe, expect, it } from "vitest";
import { extractPalette, type RawImage } from "@/lib/engine/color/extract";
import { deltaE, hexToOklab } from "@/lib/engine/model/color";
import { bands, hex, makeImage, solid } from "./helpers/raw-image";

const sum = (p: { weight: number }[]) => p.reduce((s, c) => s + c.weight, 0);
const near = (a: string, b: string, tol = 0.02) => deltaE(hexToOklab(a), hexToOklab(b)) <= tol;

const RED: [number, number, number] = [220, 30, 40];
const GREEN: [number, number, number] = [40, 170, 60];
const BLUE: [number, number, number] = [30, 60, 200];

describe("extractPalette", () => {
  it("finds three solid blocks with their weights (50 / 30 / 20 %)", () => {
    const p = extractPalette(bands(200, 100, [RED, GREEN, BLUE], [0.5, 0.3, 0.2]));
    expect(p).toHaveLength(3);
    expect(p.map((c) => c.hex)).toEqual([hex(...RED), hex(...GREEN), hex(...BLUE)]);
    expect(p[0].weight).toBeCloseTo(0.5, 1);
    expect(Math.abs(p[0].weight - 0.5)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(p[1].weight - 0.3)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(p[2].weight - 0.2)).toBeLessThanOrEqual(0.02);
  });

  it("two-colour split", () => {
    const p = extractPalette(bands(120, 60, [[255, 255, 255], [0, 0, 0]], [0.75, 0.25]));
    expect(p.map((c) => c.hex)).toEqual(["#ffffff", "#000000"]);
    expect(Math.abs(p[0].weight - 0.75)).toBeLessThanOrEqual(0.02);
  });

  it("returns 8 colours for 8 distinct vivid blocks and 5 for 5", () => {
    const eight: [number, number, number][] = [
      [255, 0, 0], [255, 140, 0], [255, 230, 0], [0, 170, 0], [0, 200, 200], [0, 60, 255], [140, 0, 255], [255, 0, 170],
    ];
    expect(extractPalette(bands(400, 50, eight, eight.map(() => 1 / 8)))).toHaveLength(8);
    const five = eight.slice(0, 5);
    expect(extractPalette(bands(250, 50, five, five.map(() => 1 / 5)))).toHaveLength(5);
  });

  it("honours k", () => {
    const eight: [number, number, number][] = [
      [255, 0, 0], [255, 140, 0], [255, 230, 0], [0, 170, 0], [0, 200, 200], [0, 60, 255], [140, 0, 255], [255, 0, 170],
    ];
    const img = bands(400, 50, eight, eight.map(() => 1 / 8));
    expect(extractPalette(img, 5).length).toBeLessThanOrEqual(5);
    expect(extractPalette(img, 3).length).toBeLessThanOrEqual(3);
    expect(sum(extractPalette(img, 3))).toBeCloseTo(1, 6);
  });

  it("all-white and all-black are a single colour", () => {
    expect(extractPalette(solid(30, 30, [255, 255, 255]))).toEqual([{ hex: "#ffffff", weight: 1 }]);
    expect(extractPalette(solid(30, 30, [0, 0, 0]))).toEqual([{ hex: "#000000", weight: 1 }]);
  });

  it("a 1x1 image is one colour", () => {
    expect(extractPalette(solid(1, 1, [10, 200, 30]))).toEqual([{ hex: hex(10, 200, 30), weight: 1 }]);
  });

  it("fully transparent and empty images give no colours", () => {
    expect(extractPalette(solid(20, 20, [255, 0, 0, 0]))).toEqual([]);
    expect(extractPalette(solid(20, 20, [255, 0, 0, 100]))).toEqual([]); // alpha < 128 is ignored
    expect(extractPalette({ data: new Uint8ClampedArray(0), width: 0, height: 0 })).toEqual([]);
    expect(extractPalette({ data: new Uint8ClampedArray(0), width: 10, height: 10 })).toEqual([]); // inconsistent buffer
  });

  it("ignores the transparent part of a PNG", () => {
    const img = makeImage(100, 100, (x) => (x < 50 ? [0, 0, 255, 255] : [255, 0, 0, 0]));
    expect(extractPalette(img)).toEqual([{ hex: "#0000ff", weight: 1 }]);
  });

  it("grayscale ramp gives neutral greys", () => {
    const p = extractPalette(makeImage(256, 20, (x) => [x, x, x]));
    expect(p.length).toBeGreaterThanOrEqual(3);
    for (const c of p) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.hex.slice(i, i + 2), 16));
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(1);
    }
    expect(sum(p)).toBeCloseTo(1, 6);
  });

  it("a gradient from red to blue spans both ends", () => {
    const p = extractPalette(makeImage(200, 40, (x) => [Math.round(255 * (1 - x / 199)), 0, Math.round(255 * (x / 199))]));
    expect(p.length).toBeGreaterThanOrEqual(3);
    expect(p.some((c) => near(c.hex, "#ff0000", 0.12))).toBe(true);
    expect(p.some((c) => near(c.hex, "#0000ff", 0.12))).toBe(true);
    expect(sum(p)).toBeCloseTo(1, 6);
  });

  it("merges near-identical shades (delta E 0.02) into one", () => {
    const a = hexToOklab("#808080");
    const base: [number, number, number] = [128, 128, 128];
    // 5 RGB levels apart is about 0.02 in OKLab at mid grey
    const other: [number, number, number] = [133, 133, 133];
    expect(deltaE(a, hexToOklab("#858585"))).toBeLessThan(0.04);
    expect(extractPalette(bands(100, 20, [base, other], [0.5, 0.5]))).toHaveLength(1);
  });

  it("is sorted by weight, weights sum to 1, hex values are valid", () => {
    const p = extractPalette(bands(300, 30, [RED, GREEN, BLUE], [0.2, 0.5, 0.3]));
    for (let i = 1; i < p.length; i++) expect(p[i - 1].weight).toBeGreaterThanOrEqual(p[i].weight);
    expect(Math.abs(sum(p) - 1)).toBeLessThan(1e-6);
    for (const c of p) expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("drops colours under 1 % of the image", () => {
    const img = makeImage(100, 100, (x, y) => (x === 0 && y < 50 ? [255, 0, 0] : [0, 0, 255]));
    expect(extractPalette(img).map((c) => c.hex)).toEqual(["#0000ff"]);
  });

  it("is deterministic", () => {
    const img = makeImage(160, 90, (x, y) => [(x * 7 + y * 3) % 256, (x * 5) % 256, (y * 11) % 256]);
    expect(extractPalette(img)).toEqual(extractPalette(img));
    expect(extractPalette(img, 6)).toEqual(extractPalette(img, 6));
  });

  it("copes with a 4000 x 3000 image in under 150 ms", () => {
    const w = 4000;
    const h = 3000;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        data[i] = (x >> 4) & 255;
        data[i + 1] = (y >> 3) & 255;
        data[i + 2] = ((x + y) >> 5) & 255;
        data[i + 3] = 255;
      }
    }
    const img: RawImage = { data, width: w, height: h };
    extractPalette(img); // warm up the JIT, as the worker would have by the second image
    const t0 = performance.now();
    const p = extractPalette(img);
    const ms = performance.now() - t0;
    console.log(`extractPalette 4000x3000: ${ms.toFixed(1)} ms (${p.length} colours)`);
    expect(ms).toBeLessThan(150);
    expect(p.length).toBeGreaterThan(0);
  });
});
