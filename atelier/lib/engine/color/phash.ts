// Perceptual (difference) hash of an image: 64 bits saying, for each of 8 rows, which of nine neighbouring cells is
// brighter. Survives resizing, recompression and small colour shifts; changes for different pictures. Pure, raw RGBA in.
import type { RawImage } from "./extract";

const COLS = 9;
const ROWS = 8;
const ZERO = "0000000000000000";
/** Averaging the same value over fractional areas leaves float dust; a flat region must not turn into noise bits. */
const EPS = 1e-6;
const HASH = /^[0-9a-fA-F]{16}$/;

/**
 * 16 lower-case hex characters. The image is box-averaged (area-weighted, so it works for any size from 1 x 1 up) to
 * 9 x 8 luma values (Rec. 709 weights on the sRGB bytes; transparent pixels count as white), then each cell is compared
 * with the one to its right: bit = left > right, row-major, most significant bit first. A flat image hashes to all zeros;
 * an empty or inconsistent one too.
 */
export function dhash(img: RawImage): string {
  const { data, width, height } = img;
  if (!(width > 0 && height > 0) || data.length < width * height * 4) return ZERO;

  // Luma per source pixel, composited over white.
  const luma = new Float64Array(width * height);
  for (let p = 0, i = 0; p < luma.length; p++, i += 4) {
    const a = data[i + 3] / 255;
    const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    luma[p] = l * a + 255 * (1 - a);
  }

  const cell = new Float64Array(COLS * ROWS);
  const cw = width / COLS;
  const ch = height / ROWS;
  for (let cy = 0; cy < ROWS; cy++) {
    const y0 = cy * ch;
    const y1 = y0 + ch;
    for (let cx = 0; cx < COLS; cx++) {
      const x0 = cx * cw;
      const x1 = x0 + cw;
      let sum = 0;
      let area = 0;
      for (let y = Math.floor(y0); y < Math.min(height, Math.ceil(y1)); y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        if (wy <= 0) continue;
        for (let x = Math.floor(x0); x < Math.min(width, Math.ceil(x1)); x++) {
          const wx = Math.min(x + 1, x1) - Math.max(x, x0);
          if (wx <= 0) continue;
          const w = wx * wy;
          sum += luma[y * width + x] * w;
          area += w;
        }
      }
      cell[cy * COLS + cx] = area > 0 ? sum / area : 0;
    }
  }

  let out = "";
  for (let cy = 0; cy < ROWS; cy++) {
    let byte = 0;
    for (let cx = 0; cx < COLS - 1; cx++) {
      byte = (byte << 1) | (cell[cy * COLS + cx] > cell[cy * COLS + cx + 1] + EPS ? 1 : 0);
    }
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

const POP = new Uint8Array(16).map((_, n) => (n & 1) + ((n >> 1) & 1) + ((n >> 2) & 1) + (n >> 3));

/** Number of differing bits between two hashes from dhash(); 64 (completely different) when either is not 16 hex characters. */
export function hamming(a: string, b: string): number {
  if (typeof a !== "string" || typeof b !== "string" || !HASH.test(a) || !HASH.test(b)) return 64;
  let d = 0;
  for (let i = 0; i < 16; i++) d += POP[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  return d;
}
