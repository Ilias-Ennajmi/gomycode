import { isAssetId, assetKey, type AssetVariant } from "./asset-id";
import type { AssetResolver } from "./resolver-types";

export type LocalBlobs = { w1024?: Blob; original?: Blob };

function normaliseHost(h: string | null | undefined): string | null {
  const host = (h ?? "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return host || null;
}

/**
 * Where the canvas gets image bytes: a local blob URL while the upload is still queued (or the page that added the
 * image is still open), otherwise the public R2 URL. `null` = nothing known: views show a placeholder.
 */
export class AssetResolverImpl implements AssetResolver {
  private readonly host: string | null;
  private readonly local = new Map<string, Partial<Record<AssetVariant, string>>>();

  constructor(opts: { publicHost?: string | null } = {}) {
    // Read with literal property access so Next inlines the NEXT_PUBLIC_ value into the browser bundle.
    const fromEnv = process.env.NEXT_PUBLIC_R2_PUBLIC_HOST || process.env.R2_PUBLIC_HOST;
    this.host = normaliseHost("publicHost" in opts ? opts.publicHost : fromEnv);
  }

  url(assetId: string, variant: AssetVariant): string | null {
    if (!isAssetId(assetId)) return null;
    const local = this.local.get(assetId);
    const blobUrl = local?.[variant];
    if (blobUrl) return blobUrl;
    return this.host ? `https://${this.host}/${assetKey(assetId, variant)}` : null;
  }

  registerLocal(assetId: string, blobs: LocalBlobs): void {
    if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return;
    this.forgetLocal(assetId);
    const urls: Partial<Record<AssetVariant, string>> = {};
    if (blobs.w1024) urls.w1024 = URL.createObjectURL(blobs.w1024);
    if (blobs.original) urls.original = URL.createObjectURL(blobs.original);
    this.local.set(assetId, urls);
  }

  forgetLocal(assetId: string): void {
    const urls = this.local.get(assetId);
    if (!urls) return;
    for (const u of Object.values(urls)) if (u) URL.revokeObjectURL(u);
    this.local.delete(assetId);
  }
}

let shared: AssetResolverImpl | null = null;
/** The one resolver the whole app shares. */
export function getAssetResolver(): AssetResolverImpl {
  return (shared ??= new AssetResolverImpl());
}
