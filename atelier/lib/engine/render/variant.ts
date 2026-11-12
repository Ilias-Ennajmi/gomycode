// Which image variant to show for a given on-screen size. Pure: no DOM.
import { VARIANT_NAMES, VARIANT_SIZES, type VariantName } from "@/lib/assets/variants";

export type ChosenVariant = VariantName | "original";

/** Ascending. */
export const TIERS: readonly ChosenVariant[] = [...VARIANT_NAMES, "original"];

/** Above this many device pixels the original is worth loading. */
export const ORIGINAL_ABOVE = 2048;

export interface PickInput {
  /** Longest on-screen side of the image, in CSS px. */
  onScreenPx: number;
  dpr: number;
  /** 0..1: how much of the source's longest side the object shows (a 25 % crop is 0.25). Default 1. */
  cropFraction: number;
  /** Variants the asset has (never the original: it always exists). */
  available: VariantName[];
  /** Longest side of the original in px; 0 or less when unknown. */
  originalLongest: number;
  /** The tier currently shown, if any. */
  loaded: ChosenVariant | null;
  /** The camera is moving: never go below what is already loaded. */
  gesture: boolean;
}

const finitePositive = (v: number, fallback: number): number => (Number.isFinite(v) && v > 0 ? v : fallback);

/** Longest side, in px, of a tier (the original's is its real size, or 2048 when unknown). */
export function tierSize(t: ChosenVariant, originalLongest: number): number {
  return t === "original" ? Math.max(finitePositive(originalLongest, ORIGINAL_ABOVE), 1) : VARIANT_SIZES[t];
}

/** The tier that covers `needed` device pixels (longest side of the source), ignoring what is loaded. */
function covering(needed: number, available: VariantName[], originalLongest: number): ChosenVariant {
  const have = VARIANT_NAMES.filter((v) => available.includes(v));
  const hit = have.find((v) => VARIANT_SIZES[v] >= needed);
  if (hit) return hit;
  if (have.length === 0) return "original";
  if (needed > ORIGINAL_ABOVE) return "original";
  // Nothing big enough. When the source itself is no larger than a w2048 there is no bigger variant to wait for, and
  // the original is the next tier up; otherwise keep the largest variant (the original is a heavy download).
  const largest = have[have.length - 1];
  if (originalLongest > VARIANT_SIZES[largest] && originalLongest <= ORIGINAL_ABOVE) return "original";
  return largest;
}

/**
 * Pick the smallest variant at least `onScreenPx * dpr / cropFraction` px across; the original above 2048 px (or when
 * there is nothing else). While the camera moves a loaded tier is never swapped for a smaller one; once it settles a
 * smaller tier replaces it only if the need fell below half of the loaded tier (no flip-flopping at a boundary).
 */
export function pickVariant(i: PickInput): ChosenVariant {
  const dpr = finitePositive(i.dpr, 1);
  const crop = Number.isFinite(i.cropFraction) && i.cropFraction > 0 ? Math.min(1, i.cropFraction) : 1;
  const px = Number.isNaN(i.onScreenPx) ? 0 : Math.max(i.onScreenPx, 0);
  const needed = (px * dpr) / crop;
  const want = covering(needed, i.available, i.originalLongest);

  const loaded = i.loaded;
  if (!loaded || (loaded !== "original" && !i.available.includes(loaded))) return want;
  const rank = (t: ChosenVariant) => TIERS.indexOf(t);
  if (rank(want) >= rank(loaded)) return want;
  if (i.gesture) return loaded;
  return needed < 0.5 * tierSize(loaded, i.originalLongest) ? want : loaded;
}
