import { VARIANT_NAMES, VARIANT_SIZES, type VariantName } from "@/lib/assets/variants";

/**
 * Which still of a video's / GIF's poster to show for a card that is `neededPx` device pixels wide: the smallest one
 * that covers it, else the largest there is. Null when the asset has no stills; the "original" is never an option
 * (for a video it is the video file, for a GIF the animation).
 */
export function pickPosterVariant(available: readonly VariantName[], neededPx: number): VariantName | null {
  const have = VARIANT_NAMES.filter((n) => available.includes(n));
  if (have.length === 0) return null;
  const need = Number.isFinite(neededPx) && neededPx > 0 ? neededPx : Number.isNaN(neededPx) || neededPx < 0 ? 0 : Infinity;
  return have.find((n) => VARIANT_SIZES[n] >= need) ?? have[have.length - 1];
}
