/**
 * Resolves an asset id to a URL the browser can load. Types only: the real implementation (local blob first, then the
 * R2 variant) lives in lib/assets/resolver.ts. `null` means "not available (yet)": views show a placeholder.
 */
export interface AssetResolver {
  url(assetId: string, variant: "w1024" | "original"): string | null;
}
