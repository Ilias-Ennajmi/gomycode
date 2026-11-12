import { deltaE, hexToOklab, normalizeHex, oklabToHex, type Oklab } from "../model/color";
import type { PaletteColor, PaletteSwatch } from "../model/types";

export type AggregateInput = { palette: readonly PaletteColor[]; /** On-screen area of the image (w * h). */ area: number };
export type AggregateOptions = {
  maxColors: number;
  /** Swatches to keep whatever the images say: locked ones and renamed ones. Their name and lock flag are preserved. */
  locked: readonly PaletteSwatch[];
  /** Colours closer than this (OKLab distance) are one colour. Default 0.05. */
  mergeDeltaE?: number;
};

type Cluster = { hex: string; lab: Oklab; weight: number; keep: PaletteSwatch | null };

const MERGE_DELTA_E = 0.05;
/** Pre-merge cell size: far below the merge distance, so it only removes near-duplicates before the greedy pass. */
const CELL = 0.02;
const MAX_CLUSTERS = 400;

function mean(a: Cluster, b: Cluster): Oklab {
  const t = a.weight + b.weight;
  if (t <= 0) return a.lab;
  return [(a.lab[0] * a.weight + b.lab[0] * b.weight) / t, (a.lab[1] * a.weight + b.lab[1] * b.weight) / t, (a.lab[2] * a.weight + b.lab[2] * b.weight) / t].map((v, i) => (Number.isFinite(v) ? v : a.lab[i])) as Oklab;
}

/** Colours of all images as weighted points, identical colours summed and near-identical ones bucketed (bounds the work). */
function points(inputs: readonly AggregateInput[]): Cluster[] {
  const byHex = new Map<string, number>();
  for (const input of inputs) {
    if (!Number.isFinite(input.area) || input.area <= 0) continue;
    for (const c of input.palette) {
      const w = input.area * c.weight;
      const hex = normalizeHex(c.hex);
      if (!hex || !Number.isFinite(w) || w <= 0) continue;
      byHex.set(hex, (byHex.get(hex) ?? 0) + w);
    }
  }
  let cell = CELL;
  let out: Cluster[] = [];
  for (let pass = 0; pass < 6; pass++) {
    const buckets = new Map<string, { sum: Oklab; weight: number; hexes: Map<string, number> }>();
    for (const [hex, weight] of byHex) {
      const lab = hexToOklab(hex);
      const key = `${Math.round(lab[0] / cell)},${Math.round(lab[1] / cell)},${Math.round(lab[2] / cell)}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { sum: [0, 0, 0], weight: 0, hexes: new Map() }));
      b.sum[0] += lab[0] * weight;
      b.sum[1] += lab[1] * weight;
      b.sum[2] += lab[2] * weight;
      b.weight += weight;
      b.hexes.set(hex, (b.hexes.get(hex) ?? 0) + weight);
    }
    out = [...buckets.values()].map((b) => {
      const lab: Oklab = [b.sum[0] / b.weight, b.sum[1] / b.weight, b.sum[2] / b.weight];
      // One member keeps its exact hex; several are their weighted mean.
      const hex = b.hexes.size === 1 ? [...b.hexes.keys()][0] : oklabToHex(...lab);
      return { hex, lab: b.hexes.size === 1 ? hexToOklab(hex) : lab, weight: b.weight, keep: null };
    });
    if (out.length <= MAX_CLUSTERS) break;
    cell *= 2;
  }
  return out;
}

/**
 * The colours of a board: every image's palette weighted by its area and by each colour's share of the image, merged in
 * OKLab until at most `maxColors` remain and no two are closer than `mergeDeltaE`. Locked swatches seed the result: a
 * colour within the merge distance of one is absorbed into it (the swatch keeps its hex and name), and they stay even
 * when nothing on the board has that colour (weight 0). Weights sum to 1; sorted by weight, locked first on ties.
 * Pure and deterministic.
 */
export function aggregatePalette(inputs: readonly AggregateInput[], o: AggregateOptions): PaletteSwatch[] {
  const threshold = o.mergeDeltaE ?? MERGE_DELTA_E;
  const seeds: Cluster[] = [];
  const seen = new Set<string>();
  for (const s of o.locked) {
    const hex = normalizeHex(s.hex);
    if (!hex || seen.has(hex)) continue;
    seen.add(hex);
    seeds.push({ hex, lab: hexToOklab(hex), weight: 0, keep: { hex, weight: 0, name: s.name, locked: s.locked } });
  }
  const free = points(inputs);
  let total = 0;
  for (const p of free) total += p.weight;

  const result: Cluster[] = seeds.slice();
  if (total > 0) {
    // Absorb into locked swatches first.
    const rest: Cluster[] = [];
    for (const p of free) {
      let best: Cluster | null = null;
      let bestD = Infinity;
      for (const s of seeds) {
        const d = deltaE(p.lab, s.lab);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      if (best && bestD <= threshold) best.weight += p.weight;
      else rest.push(p);
    }
    // Greedy nearest-pair merge: free with free (weighted mean) or free into a locked swatch (which keeps its identity).
    const budget = Math.max(0, Math.round(o.maxColors) - seeds.length);
    let live = rest;
    for (;;) {
      let bi = -1;
      let bj = -1;
      let bd = Infinity;
      for (let i = 0; i < live.length; i++) {
        for (let j = i + 1; j < live.length; j++) {
          const d = deltaE(live[i].lab, live[j].lab);
          if (d < bd) {
            bd = d;
            bi = i;
            bj = j;
          }
        }
        for (let k = 0; k < seeds.length; k++) {
          const d = deltaE(live[i].lab, seeds[k].lab);
          if (d < bd) {
            bd = d;
            bi = i;
            bj = -1 - k;
          }
        }
      }
      if (bi < 0 || (live.length <= budget && bd >= threshold)) break;
      if (bj < 0) {
        seeds[-1 - bj].weight += live[bi].weight;
        live = live.filter((_, i) => i !== bi);
      } else {
        const a = live[bi];
        const b = live[bj];
        const lab = mean(a, b);
        const merged: Cluster = { hex: oklabToHex(...lab), lab, weight: a.weight + b.weight, keep: null };
        live = live.filter((_, i) => i !== bi && i !== bj);
        live.push(merged);
      }
      if (live.length === 0) break;
    }
    // Over budget with nothing close enough to merge cannot happen: the loop merges the nearest pair until it fits.
    result.push(...live);
  }

  const sum = result.reduce((a, c) => a + c.weight, 0);
  const out = result.map((c): PaletteSwatch => ({
    hex: c.hex,
    weight: sum > 0 ? c.weight / sum : 0,
    name: c.keep ? c.keep.name : "",
    locked: c.keep ? c.keep.locked : false,
  }));
  // Stable order: weight desc, locked first, then hex (so equal inputs give an identical list).
  return out.sort((a, b) => b.weight - a.weight || Number(b.locked) - Number(a.locked) || (a.hex < b.hex ? -1 : a.hex > b.hex ? 1 : 0));
}

/**
 * Whether an image has `hex` among its colours: a palette colour with at least `minWeight` (default 4 %) of the image that
 * lies within `tolerance` (default OKLab distance 0.08) of it.
 */
export function imageContainsColor(palette: readonly PaletteColor[], hex: string, o: { tolerance?: number; minWeight?: number } = {}): boolean {
  const norm = normalizeHex(hex);
  if (!norm) return false;
  const tolerance = o.tolerance ?? 0.08;
  const minWeight = o.minWeight ?? 0.04;
  const target = hexToOklab(norm);
  for (const c of palette) {
    if (!(c.weight >= minWeight)) continue;
    if (normalizeHex(c.hex) && deltaE(hexToOklab(c.hex), target) <= tolerance) return true;
  }
  return false;
}
