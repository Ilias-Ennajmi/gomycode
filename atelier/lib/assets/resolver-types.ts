import type { VariantName } from "./variants";

/**
 * Resolves an asset id to a URL the browser can load. Types only: the real implementation (local blob first, then the
 * R2 variant) lives in lib/assets/resolver.ts. `null` means "not available (yet)": views show a placeholder.
 *
 * `url` falls back when the asked-for variant does not exist: the variant itself, then w1024, then the original.
 */
export interface AssetResolver {
  url(assetId: string, variant: VariantName | "original"): string | null;
  /**
   * Which variants exist and the source size, from the cached asset metadata (pending local uploads included).
   * `null` when nothing is known about the asset (for instance a board opened on a new device before its asset
   * metadata arrived): treat that as a Phase 1 asset, which has w1024 and the original.
   */
  available(assetId: string): { variants: VariantName[]; width: number; height: number } | null;
  /** Called when URLs or metadata may have changed (an upload registered, metadata arrived). Returns the unsubscribe function. */
  subscribe?(cb: () => void): () => void;
}
