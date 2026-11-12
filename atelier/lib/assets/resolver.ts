import { isAssetId, assetKey, type AssetVariant } from "./asset-id";
import { AssetMetaStore, getAssetMetaStore, type AssetMeta } from "./meta-store";
import type { AssetResolver } from "./resolver-types";
import type { VariantName } from "./variants";

export type LocalBlobs = Partial<Record<AssetVariant, Blob>>;
/** What the caller knows about a locally registered asset; kept after the blobs are forgotten. */
export type LocalInfo = Pick<AssetMeta, "kind" | "width" | "height" | "bytes" | "variants"> & Partial<Pick<AssetMeta, "title" | "provenance" | "palette" | "phash" | "analysisVersion">> & { mime?: string };

function normaliseHost(h: string | null | undefined): string | null {
  const host = (h ?? "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return host || null;
}

/** Variants a Phase 1 asset has: the 1024 px WebP and the original. */
const LEGACY: readonly VariantName[] = ["w1024"];

/**
 * Where the canvas gets image bytes: a local blob URL while the upload is still queued (or the page that added the
 * image is still open), otherwise the public R2 URL. `null` = nothing known: views show a placeholder.
 */
export class AssetResolverImpl implements AssetResolver {
  private readonly host: string | null;
  private readonly local = new Map<string, Partial<Record<AssetVariant, string>>>();
  /** Asset metadata (variants, size). Shared with the rest of the app through getAssetMetaStore(). */
  readonly meta: AssetMetaStore;

  private readonly listeners = new Set<() => void>();

  constructor(opts: { publicHost?: string | null; meta?: AssetMetaStore } = {}) {
    // Read with literal property access so Next inlines the NEXT_PUBLIC_ value into the browser bundle.
    const fromEnv = process.env.NEXT_PUBLIC_R2_PUBLIC_HOST || process.env.R2_PUBLIC_HOST;
    this.host = normaliseHost("publicHost" in opts ? opts.publicHost : fromEnv);
    this.meta = opts.meta ?? new AssetMetaStore({ persist: false });
    this.meta.subscribe(() => this.notify());
  }

  /** Told when a URL or the metadata behind one may have changed. Returns the unsubscribe function. */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify(): void {
    for (const cb of [...this.listeners]) cb();
  }

  url(assetId: string, variant: AssetVariant): string | null {
    if (!isAssetId(assetId)) return null;
    const local = this.local.get(assetId);
    const known = this.meta.get(assetId)?.variants ?? LEGACY;
    // The variant asked for, then w1024, then the original (which always exists).
    const chain: AssetVariant[] = variant === "original" ? ["original"] : variant === "w1024" ? ["w1024", "original"] : [variant, "w1024", "original"];
    for (const v of chain) {
      const blobUrl = local?.[v];
      if (blobUrl) return blobUrl;
      if (this.host && (v === "original" || known.includes(v))) return `https://${this.host}/${assetKey(assetId, v)}`;
    }
    return null;
  }

  /**
   * Every file this device can reach for an asset, by variant name: a local blob URL while one exists, else the public R2
   * URL. Export workers read pictures from these (a worker cannot ask the resolver itself).
   */
  urlsFor(assetId: string): Partial<Record<AssetVariant, string>> {
    const out: Partial<Record<AssetVariant, string>> = {};
    if (!isAssetId(assetId)) return out;
    const known = this.meta.get(assetId)?.variants ?? LEGACY;
    const local = this.local.get(assetId);
    for (const v of [...known, "original"] as AssetVariant[]) {
      const url = local?.[v] ?? (this.host ? `https://${this.host}/${assetKey(assetId, v)}` : undefined);
      if (url) out[v] = url;
    }
    return out;
  }

  available(assetId: string): { variants: VariantName[]; width: number; height: number } | null {
    if (!isAssetId(assetId)) return null;
    const m = this.meta.get(assetId);
    return m ? { variants: [...m.variants], width: m.width, height: m.height } : null;
  }

  /** Add metadata learned elsewhere (a duplicate's, the server's). */
  remember(m: AssetMeta): void {
    this.meta.put(m);
  }

  /**
   * Show `blobs` for this asset (an upload in flight, or bytes kept on this device). `info` also records the asset's
   * size and variants so `available()` knows about it.
   */
  registerLocal(assetId: string, blobs: LocalBlobs, info?: LocalInfo): void {
    if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return;
    this.forgetLocal(assetId);
    const urls: Partial<Record<AssetVariant, string>> = {};
    for (const [name, blob] of Object.entries(blobs) as [AssetVariant, Blob | undefined][]) {
      if (blob) urls[name] = URL.createObjectURL(blob);
    }
    this.local.set(assetId, urls);
    this.notify();
    if (info) {
      const prev = this.meta.get(assetId);
      this.meta.put({
        id: assetId,
        kind: info.kind,
        width: info.width,
        height: info.height,
        bytes: info.bytes,
        variants: [...info.variants],
        palette: info.palette ?? prev?.palette ?? null,
        phash: info.phash ?? prev?.phash ?? null,
        title: info.title ?? prev?.title ?? "",
        provenance: info.provenance ?? prev?.provenance ?? null,
        analysisVersion: Math.max(info.analysisVersion ?? 0, prev?.analysisVersion ?? 0),
      });
    }
  }

  forgetLocal(assetId: string): void {
    const urls = this.local.get(assetId);
    if (!urls) return;
    for (const u of Object.values(urls)) if (u) URL.revokeObjectURL(u);
    this.local.delete(assetId);
    this.notify();
  }
}

let shared: AssetResolverImpl | null = null;
/** The one resolver the whole app shares. */
export function getAssetResolver(): AssetResolverImpl {
  return (shared ??= new AssetResolverImpl({ meta: getAssetMetaStore() }));
}
