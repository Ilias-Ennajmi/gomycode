import { describe, expect, it } from "vitest";
import { dhash, hamming } from "@/lib/engine/color/phash";
import { makeImage, noisy, resizeBox, resizeNearest, solid } from "./helpers/raw-image";

/** A busy but smooth test picture: a few blobs and a diagonal ramp. */
const picture = (w: number, h: number) =>
  makeImage(w, h, (x, y) => {
    const u = x / w;
    const v = y / h;
    const l = 120 + 80 * Math.sin(u * 9) * Math.cos(v * 7) + 40 * u;
    return [l, l * 0.9 + 20 * v, 255 - l * 0.7];
  });
const other = (w: number, h: number) =>
  makeImage(w, h, (x, y) => {
    const u = x / w;
    const v = y / h;
    const l = 128 + 100 * Math.cos(u * 4 + 1) * Math.sin(v * 11) - 60 * v;
    return [255 - l, l, l * 0.5];
  });
const ramp = (w: number, h: number, add = 0) => makeImage(w, h, (x) => [Math.min(255, (x * 200) / w + add), Math.min(255, (x * 200) / w + add), Math.min(255, (x * 200) / w + add)]);

describe("dhash", () => {
  it("is 16 lower-case hex characters", () => {
    expect(dhash(picture(90, 60))).toMatch(/^[0-9a-f]{16}$/);
  });
  it("identical images hash the same", () => {
    expect(hamming(dhash(picture(90, 60)), dhash(picture(90, 60)))).toBe(0);
  });
  it("is stable under a brightness shift", () => {
    expect(hamming(dhash(ramp(90, 60)), dhash(ramp(90, 60, 10)))).toBeLessThanOrEqual(4);
  });
  it("is stable under a 2x nearest-neighbour upscale", () => {
    const a = picture(90, 60);
    expect(hamming(dhash(a), dhash(resizeNearest(a, 180, 120)))).toBeLessThanOrEqual(2);
  });
  it("is stable under resize and JPEG-like noise (hamming <= 6)", () => {
    const a = picture(640, 480);
    const small = resizeBox(a, 64, 48);
    expect(hamming(dhash(a), dhash(small))).toBeLessThanOrEqual(6);
    expect(hamming(dhash(a), dhash(noisy(small, 12)))).toBeLessThanOrEqual(6);
    expect(hamming(dhash(a), dhash(noisy(a, 10, 7)))).toBeLessThanOrEqual(6);
    expect(hamming(dhash(small), dhash(resizeBox(a, 200, 150)))).toBeLessThanOrEqual(6);
  });
  it("differs for different pictures and for a mirrored gradient", () => {
    expect(hamming(dhash(picture(90, 60)), dhash(other(90, 60)))).toBeGreaterThan(12);
    const a = ramp(90, 60);
    const mirrored = makeImage(90, 60, (x, y) => {
      const i = (y * 90 + (89 - x)) * 4;
      return [a.data[i], a.data[i + 1], a.data[i + 2]];
    });
    expect(hamming(dhash(a), dhash(mirrored))).toBeGreaterThanOrEqual(20);
  });
  it("gives a valid hash for flat, 1x1, empty and transparent images", () => {
    expect(dhash(solid(50, 50, [90, 90, 90]))).toMatch(/^[0-9a-f]{16}$/);
    expect(dhash(solid(1, 1, [255, 0, 0]))).toMatch(/^[0-9a-f]{16}$/);
    expect(dhash(solid(3, 2, [255, 0, 0]))).toMatch(/^[0-9a-f]{16}$/);
    expect(dhash({ data: new Uint8ClampedArray(0), width: 0, height: 0 })).toBe("0000000000000000");
    expect(dhash(solid(40, 40, [255, 0, 0, 0]))).toMatch(/^[0-9a-f]{16}$/);
  });
  it("is deterministic and bit order is row-major, MSB first", () => {
    // Brightest on the left, darkest on the right: every comparison is "left > right", so every bit is 1.
    const falling = makeImage(90, 8, (x) => [255 - x * 2, 255 - x * 2, 255 - x * 2]);
    expect(dhash(falling)).toBe("ffffffffffffffff");
    const rising = makeImage(90, 8, (x) => [x * 2, x * 2, x * 2]);
    expect(dhash(rising)).toBe("0000000000000000");
    // Only the first comparison of the first row (the top bit) is set.
    const firstOnly = makeImage(9, 8, (x, y) => (y === 0 && x === 0 ? [255, 255, 255] : [0, 0, 0]));
    expect(dhash(firstOnly)).toBe("8000000000000000");
  });
});

describe("hamming", () => {
  it("counts differing bits", () => {
    expect(hamming("0000000000000000", "000000000000000f")).toBe(4);
    expect(hamming("ffffffffffffffff", "0000000000000000")).toBe(64);
    expect(hamming("0123456789abcdef", "0123456789abcdef")).toBe(0);
    expect(hamming("0123456789ABCDEF", "0123456789abcdef")).toBe(0);
  });
  it("is 64 for anything that is not 16 hex characters", () => {
    expect(hamming("zz", "0000000000000000")).toBe(64);
    expect(hamming("", "")).toBe(64);
    expect(hamming("0000000000000000", "000000000000000g")).toBe(64);
    expect(hamming(undefined as unknown as string, "0000000000000000")).toBe(64);
  });
});

describe("dhash of flat regions", () => {
  it("is the same all-zero hash whatever the image size (no float dust turning into bits)", () => {
    for (const [w, h] of [[1, 1], [3, 2], [7, 13], [64, 48], [100, 77], [333, 211]]) {
      expect(dhash(solid(w, h, [123, 45, 67])), `${w}x${h}`).toBe("0000000000000000");
    }
  });
});
