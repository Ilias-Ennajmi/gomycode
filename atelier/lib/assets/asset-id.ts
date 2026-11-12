import type { VariantName } from "./variants";

/** A stored file of an asset: one of the WebP variants or the untouched original. */
export type AssetVariant = VariantName | "original";

const ASSET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * A fresh asset id: 128 random bits written in the 8-4-4-4-12 hex layout, so it fits the `atelier.assets.id`
 * uuid column and is as unguessable as the plan's 128-bit requirement (it is the only secret in an R2 URL).
 * Generated on the client so an image can be placed on the board before (and without) any network.
 */
export function newAssetId(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function isAssetId(v: unknown): v is string {
  return typeof v === "string" && ASSET_ID.test(v);
}

/**
 * R2 object key of one variant. The original has no extension on purpose: the canvas resolves
 * `a/{assetId}/original` without knowing the file type (the type is stored as the object's Content-Type).
 */
export function assetKey(assetId: string, variant: AssetVariant): string {
  return variant === "original" ? `a/${assetId}/original` : `a/${assetId}/${variant}.webp`;
}
