// Which tier an image item should show: the resolver's metadata, the item's on-screen size and crop, and pickVariant.
// Shared by every ImageLayer so they agree. Pure: no DOM.
import type { AssetResolver } from "@/lib/assets/resolver-types";
import type { VariantName } from "@/lib/assets/variants";
import type { ImageLayerItem, ImageLayerView } from "./image-layer";
import { TIERS, pickVariant, tierSize, type ChosenVariant } from "./variant";

const LEGACY_VARIANTS: VariantName[] = ["w1024"];
/** Phase 1 assets have no recorded size: assume the original is no bigger than a w2048, so it is the tier after w1024. */
const LEGACY_ORIGINAL_LONGEST = 2048;

const clamp01 = (v: number) => (Number.isFinite(v) && v > 0 ? Math.min(1, v) : 1);

export interface Selection {
  wanted: ChosenVariant;
  /** Tiers the image really has, ascending. */
  tiers: ChosenVariant[];
  /** Decoded size of `wanted`. */
  w: number;
  h: number;
  /** Source size (0 when unknown). */
  aw: number;
  ah: number;
  originalLongest: number;
}

/** Decoded size of `tier` for a source of this aspect ratio. */
export function decodedSize(tier: ChosenVariant, aspect: number, originalLongest: number): { w: number; h: number } {
  const longest = tierSize(tier, originalLongest);
  return aspect >= 1 ? { w: longest, h: longest / aspect } : { w: longest * aspect, h: longest };
}

/**
 * The tier wanted for `item` in `view`. With `settle` false (the camera is moving) an image that already shows a tier
 * keeps it; its tier is still reported so the memory budget counts it.
 */
export function selectVariant(resolver: AssetResolver, item: ImageLayerItem, view: ImageLayerView, loaded: ChosenVariant | null, settle: boolean): Selection {
  const meta = resolver.available(item.assetId);
  const variants = meta ? meta.variants : LEGACY_VARIANTS;
  const aw = meta ? meta.width : 0;
  const ah = meta ? meta.height : 0;
  const known = aw > 0 && ah > 0;
  const originalLongest = known ? Math.max(aw, ah) : LEGACY_ORIGINAL_LONGEST;
  const tiers = TIERS.filter((t) => t === "original" || variants.includes(t));
  // Measure along the source's longest axis (the object's, when the source size is unknown).
  const alongX = known ? aw >= ah : item.rect.w >= item.rect.h;
  const onScreenPx = (alongX ? item.rect.w : item.rect.h) * view.camera.z;
  const cropFraction = item.crop ? clamp01(alongX ? item.crop.w : item.crop.h) : 1;
  const wanted = !settle && loaded ? loaded : pickVariant({ onScreenPx, dpr: view.dpr, cropFraction, available: variants, originalLongest, loaded, gesture: !settle });
  const aspect = known ? aw / ah : item.rect.h > 0 ? item.rect.w / item.rect.h : 1;
  const { w, h } = decodedSize(wanted, aspect, originalLongest);
  return { wanted, tiers, w, h, aw, ah, originalLongest };
}
