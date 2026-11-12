// Image variant names and sizes. Pure (no DOM, no Node), shared by the browser pipeline, the resolver and the server routes.

export type VariantName = "w256" | "w1024" | "w2048";

/** Longest-side size in pixels of each variant. */
export const VARIANT_SIZES: Record<VariantName, number> = { w256: 256, w1024: 1024, w2048: 2048 };

/** Ascending. */
export const VARIANT_NAMES: readonly VariantName[] = ["w256", "w1024", "w2048"];

export function isVariantName(v: unknown): v is VariantName {
  return v === "w256" || v === "w1024" || v === "w2048";
}

/**
 * The variants worth making for an image: every size strictly smaller than the longest side (never upscaled), ascending.
 * A source at or below 256 px gets none: the original is its own thumbnail. Unusable sizes (NaN, 0, negative) get none.
 */
export function variantPlan(width: number, height: number): VariantName[] {
  const longest = Math.max(width, height);
  if (!Number.isFinite(longest) || longest <= 0) return [];
  return VARIANT_NAMES.filter((n) => VARIANT_SIZES[n] < longest);
}
