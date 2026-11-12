/*
 * Where a board card finds the images of its mosaic. The asset pipeline (lib/assets) knows how an
 * asset id becomes a URL; it registers that here once, and until then cards show their paper tile
 * with the first frame's name instead of broken images.
 */
type Resolver = (assetId: string) => string | null;

let resolver: Resolver | null = null;

export function setPreviewResolver(fn: Resolver | null): void {
  resolver = fn;
}

export function previewUrl(assetId: string): string | null {
  try {
    return resolver?.(assetId) ?? null;
  } catch {
    return null;
  }
}
