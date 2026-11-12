// Dominant-colour extraction for one image. Pure (raw RGBA in, hex + weight out), so it runs in the asset worker, in jsdom
// and in tests alike. k-means in OKLab on a small sample: close in OKLab means close to the eye, so clusters match what a
// person would call "the colours of this picture".
import { deltaE, oklabToHex, rgbToOklab, type Oklab } from "@/lib/engine/model/color";
import type { PaletteColor } from "@/lib/engine/model/types";

export type RawImage = { data: Uint8ClampedArray; width: number; height: number };

/** The longest side of the sample the clustering runs on. */
export const SAMPLE_SIDE = 64;
/** Pixels with less alpha than this are treated as absent. */
export const MIN_ALPHA = 128;
const MAX_ITERATIONS = 16;
/** Clusters closer than this (OKLab distance) are one colour. */
const MERGE_DELTA_E = 0.04;
/** Clusters carrying less than this share of the image are dropped. */
const MIN_WEIGHT = 0.01;

/** Small, fast, seedable PRNG (mulberry32): the same image always seeds k-means the same way. */
function prng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Opaque pixels of the image, stride-sampled to at most SAMPLE_SIDE x SAMPLE_SIDE, as a flat [L, a, b, ...] array. */
function sampleOklab(img: RawImage): Float64Array {
  const { data, width, height } = img;
  if (!(width > 0 && height > 0) || data.length < width * height * 4) return new Float64Array(0);
  const step = Math.max(1, Math.ceil(Math.max(width, height) / SAMPLE_SIDE));
  const cols = Math.ceil(width / step);
  const rows = Math.ceil(height / step);
  const out = new Float64Array(cols * rows * 3);
  // Sample the centre of each step x step cell, not its corner, so a thin border does not dominate.
  const half = step >> 1;
  let n = 0;
  for (let cy = 0; cy < rows; cy++) {
    const y = Math.min(height - 1, cy * step + half);
    for (let cx = 0; cx < cols; cx++) {
      const x = Math.min(width - 1, cx * step + half);
      const i = (y * width + x) * 4;
      if (data[i + 3] < MIN_ALPHA) continue;
      const [L, a, b] = rgbToOklab(data[i], data[i + 1], data[i + 2]);
      out[n++] = L;
      out[n++] = a;
      out[n++] = b;
    }
  }
  return out.subarray(0, n);
}

const dist2 = (p: Float64Array, i: number, c: Float64Array, j: number): number => {
  const dl = p[i] - c[j];
  const da = p[i + 1] - c[j + 1];
  const db = p[i + 2] - c[j + 2];
  return dl * dl + da * da + db * db;
};

/** k-means++ seeding. Stops early when every point already sits exactly on a centre (fewer than k distinct colours). */
function seed(points: Float64Array, k: number, rnd: () => number): Float64Array {
  const n = points.length / 3;
  const centres: number[] = [];
  const first = Math.min(n - 1, Math.floor(rnd() * n)) * 3;
  centres.push(points[first], points[first + 1], points[first + 2]);
  const d2 = new Float64Array(n);
  const firstCentre = Float64Array.from(centres);
  for (let p = 0; p < n; p++) d2[p] = dist2(points, p * 3, firstCentre, 0);
  while (centres.length / 3 < k) {
    let total = 0;
    for (let p = 0; p < n; p++) total += d2[p];
    if (!(total > 1e-12)) break;
    let r = rnd() * total;
    let pick = n - 1;
    for (let p = 0; p < n; p++) {
      r -= d2[p];
      if (r <= 0) {
        pick = p;
        break;
      }
    }
    const at = pick * 3;
    centres.push(points[at], points[at + 1], points[at + 2]);
    const c = Float64Array.from([points[at], points[at + 1], points[at + 2]]);
    for (let p = 0; p < n; p++) {
      const d = dist2(points, p * 3, c, 0);
      if (d < d2[p]) d2[p] = d;
    }
  }
  return Float64Array.from(centres);
}

/**
 * The dominant colours of an image: at most `k`, most prominent first, `weight` the share of (opaque) pixels, summing to 1.
 * Samples at most 64 x 64 pixels, ignores pixels with alpha below 128, clusters in OKLab (k-means++ seeded from the image
 * size, so the result is deterministic) and merges clusters closer than a deltaE of 0.04. An image with no opaque pixel
 * gives `[]`.
 */
export function extractPalette(img: RawImage, k = 8): PaletteColor[] {
  const maxColours = Math.max(1, Math.min(32, Math.floor(k) || 8));
  const points = sampleOklab(img);
  const n = points.length / 3;
  if (n === 0) return [];

  const rnd = prng(Math.imul(img.width, img.height) || 1);
  let centres = seed(points, Math.min(maxColours, n), rnd);
  const count = centres.length / 3;
  const assign = new Int32Array(n).fill(-1);
  const sizes = new Float64Array(count);

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let changed = false;
    for (let p = 0; p < n; p++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < count; c++) {
        const d = dist2(points, p * 3, centres, c * 3);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (assign[p] !== best) {
        assign[p] = best;
        changed = true;
      }
    }
    if (!changed) break;
    const sums = new Float64Array(count * 3);
    sizes.fill(0);
    for (let p = 0; p < n; p++) {
      const c = assign[p];
      sizes[c]++;
      sums[c * 3] += points[p * 3];
      sums[c * 3 + 1] += points[p * 3 + 1];
      sums[c * 3 + 2] += points[p * 3 + 2];
    }
    const next = Float64Array.from(centres);
    for (let c = 0; c < count; c++) {
      if (sizes[c] === 0) continue; // an empty cluster keeps its centre and is dropped below
      next[c * 3] = sums[c * 3] / sizes[c];
      next[c * 3 + 1] = sums[c * 3 + 1] / sizes[c];
      next[c * 3 + 2] = sums[c * 3 + 2] / sizes[c];
    }
    centres = next;
  }
  // Final sizes for the centres as they ended up (the loop may stop right after a move).
  sizes.fill(0);
  for (let p = 0; p < n; p++) {
    let best = 0;
    let bestD = Infinity;
    for (let c = 0; c < count; c++) {
      const d = dist2(points, p * 3, centres, c * 3);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    sizes[best]++;
  }

  type Cluster = { lab: Oklab; size: number };
  let clusters: Cluster[] = [];
  for (let c = 0; c < count; c++) {
    if (sizes[c] > 0) clusters.push({ lab: [centres[c * 3], centres[c * 3 + 1], centres[c * 3 + 2]], size: sizes[c] });
  }

  // Merge the closest pair (weighted mean) until nothing is closer than MERGE_DELTA_E.
  for (;;) {
    let bi = -1;
    let bj = -1;
    let bd = MERGE_DELTA_E;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const d = deltaE(clusters[i].lab, clusters[j].lab);
        if (d < bd) {
          bd = d;
          bi = i;
          bj = j;
        }
      }
    }
    if (bi < 0) break;
    const a = clusters[bi];
    const b = clusters[bj];
    const size = a.size + b.size;
    const lab: Oklab = [
      (a.lab[0] * a.size + b.lab[0] * b.size) / size,
      (a.lab[1] * a.size + b.lab[1] * b.size) / size,
      (a.lab[2] * a.size + b.lab[2] * b.size) / size,
    ];
    clusters = clusters.filter((_, i) => i !== bj);
    clusters[bi] = { lab, size };
  }

  clusters = clusters.filter((c) => c.size / n >= MIN_WEIGHT);
  if (clusters.length === 0) return [];
  // Most prominent first; ties by lightness then hex so the order never depends on cluster numbering.
  const result = clusters
    .map((c) => ({ hex: oklabToHex(c.lab[0], c.lab[1], c.lab[2]), size: c.size, L: c.lab[0] }))
    .sort((a, b) => b.size - a.size || b.L - a.L || (a.hex < b.hex ? -1 : 1))
    .slice(0, maxColours);

  const total = result.reduce((s, c) => s + c.size, 0);
  // Four decimals keep the stored palette small; the largest share absorbs the rounding so the weights sum to 1.
  const weights = result.map((c) => Math.round((c.size / total) * 1e4) / 1e4);
  const drift = 1 - weights.reduce((s, w) => s + w, 0);
  weights[0] = Math.round((weights[0] + drift) * 1e4) / 1e4;
  return result.map((c, i) => ({ hex: c.hex, weight: weights[i] }));
}
