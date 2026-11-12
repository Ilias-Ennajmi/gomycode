// The export worker's picture source: for each asset it picks the variant that suits the output scale (pickVariant), fetches
// it, decodes it to an ImageBitmap and keeps a small least-recently-used cache so a picture used twice is decoded once and
// memory stays bounded. Pictures that fail fall back to the next variant, then to the original (never for a video's file).
import type { AssetVariant } from "@/lib/assets/asset-id";
import type { VariantName } from "@/lib/assets/variants";
import { pickVariant, TIERS, type ChosenVariant } from "@/lib/engine/render/variant";
import type { ImageProvider } from "./raster";
import type { SvgImages } from "./svg";

export type AssetEntry = {
  width: number;
  height: number;
  /** Variants that exist (the original always does). */
  variants: VariantName[];
  urls: Partial<Record<AssetVariant, string>>;
};
export type AssetTable = Record<string, AssetEntry>;

/** What the main thread knows about assets: the resolver implements it. */
export interface AssetSource {
  available(assetId: string): { variants: VariantName[]; width: number; height: number } | null;
  urlsFor(assetId: string): Partial<Record<AssetVariant, string>>;
}

/** A plain-data table of the assets a scene uses, small enough to post to a worker. Unknown assets are left out. */
export function buildAssetTable(assetIds: readonly string[], source: AssetSource): AssetTable {
  const table: AssetTable = {};
  for (const id of assetIds) {
    const urls = source.urlsFor(id);
    if (!urls || Object.keys(urls).length === 0) continue;
    const a = source.available(id);
    // An asset nobody has metadata for is a Phase 1 asset: w1024 and the original, size unknown.
    table[id] = { width: a?.width ?? 0, height: a?.height ?? 0, variants: a?.variants ?? ["w1024"], urls };
  }
  return table;
}

/** Order in which to try tiers: the wanted one, then larger ones ascending, then smaller ones descending. */
export function tierChain(want: ChosenVariant, have: readonly ChosenVariant[]): ChosenVariant[] {
  const at = TIERS.indexOf(want);
  const up = TIERS.slice(at).filter((t) => have.includes(t));
  const down = TIERS.slice(0, at).filter((t) => have.includes(t)).reverse();
  return [...up, ...down];
}

export type ProviderOptions = {
  fetchFn?: typeof fetch;
  decode?: (blob: Blob) => Promise<ImageBitmap>;
  /** Decoded pixels kept in the cache (4 bytes each). Default 48 million (about 190 MB). */
  budgetPx?: number;
  /** Largest file fetched, in bytes (default 250 MB). */
  maxBytes?: number;
};

type Cached = { bmp: ImageBitmap; longest: number; tier: ChosenVariant; px: number };

export interface ExportImageSource extends ImageProvider {
  /** Raw bytes of the best variant for a size (SVG embedding, PDF). Null when unreadable or over `maxBytes`. */
  bytes(assetId: string, neededPx: number, opts?: { noOriginal?: boolean; maxBytes?: number }): Promise<{ data: Uint8Array; mime: string } | null>;
  /** True when pictures failed to load in a way that looks like missing CORS rules on the storage bucket. */
  corsSuspected(): boolean;
  dispose(): void;
}

function sniff(b: Uint8Array): string | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

export function createImageSource(table: AssetTable, o: ProviderOptions = {}): ExportImageSource {
  const fetchFn = o.fetchFn ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const decode = o.decode ?? ((b: Blob) => createImageBitmap(b));
  const budget = o.budgetPx ?? 48_000_000;
  const maxBytes = o.maxBytes ?? 250 * 1024 * 1024;
  const cache = new Map<string, Cached>(); // insertion order = least recently used first
  const inflight = new Map<string, Promise<ImageBitmap | null>>();
  let usedPx = 0;
  let networkErrors = 0;
  let remoteOk = 0;

  const chainFor = (id: string, neededPx: number, noOriginal: boolean): ChosenVariant[] => {
    const e = table[id];
    if (!e) return [];
    const have: ChosenVariant[] = [...e.variants.filter((v) => e.urls[v]), ...(noOriginal || !e.urls.original ? [] : (["original"] as const))];
    const want = pickVariant({ onScreenPx: neededPx, dpr: 1, cropFraction: 1, available: e.variants, originalLongest: Math.max(e.width, e.height), loaded: null, gesture: false });
    return tierChain(want, have);
  };

  async function fetchBlob(url: string): Promise<Blob | null> {
    try {
      const res = await fetchFn(url, { mode: "cors", credentials: "omit" });
      if (!res.ok) return null;
      const len = Number(res.headers?.get?.("content-length"));
      if (Number.isFinite(len) && len > maxBytes) return null;
      const blob = await res.blob();
      if (!url.startsWith("blob:")) remoteOk++;
      return blob.size > maxBytes ? null : blob;
    } catch (e) {
      if (e instanceof TypeError && !url.startsWith("blob:")) networkErrors++;
      return null;
    }
  }

  const evict = (keep: string) => {
    for (const [k, c] of cache) {
      if (usedPx <= budget) break;
      if (k === keep) continue;
      cache.delete(k);
      usedPx -= c.px;
      c.bmp.close?.();
    }
  };

  async function loadTier(id: string, tier: ChosenVariant): Promise<ImageBitmap | null> {
    const url = table[id]?.urls[tier];
    if (!url) return null;
    const blob = await fetchBlob(url);
    if (!blob) return null;
    try {
      return await decode(blob);
    } catch {
      return null;
    }
  }

  return {
    async load(assetId, neededPx, opts) {
      const e = table[assetId];
      if (!e) return null;
      const chain = chainFor(assetId, neededPx, opts?.noOriginal === true);
      if (chain.length === 0) return null;
      const hit = cache.get(assetId);
      // A cached picture serves any request whose wanted tier it already is (or exceeds).
      if (hit && TIERS.indexOf(hit.tier) >= TIERS.indexOf(chain[0])) {
        cache.delete(assetId);
        cache.set(assetId, hit);
        return hit.bmp;
      }
      const key = `${assetId}|${chain[0]}`;
      const running = inflight.get(key);
      if (running) return running;
      const p = (async () => {
        for (const tier of chain) {
          const bmp = await loadTier(assetId, tier);
          if (!bmp) continue;
          const px = bmp.width * bmp.height;
          const old = cache.get(assetId);
          if (old) {
            usedPx -= old.px;
            old.bmp.close?.();
          }
          cache.set(assetId, { bmp, longest: Math.max(bmp.width, bmp.height), tier, px });
          usedPx += px;
          evict(assetId);
          return bmp;
        }
        return null;
      })().finally(() => inflight.delete(key));
      inflight.set(key, p);
      return p;
    },

    async bytes(assetId, neededPx, opts) {
      const e = table[assetId];
      if (!e) return null;
      const cap = opts?.maxBytes ?? maxBytes;
      for (const tier of chainFor(assetId, neededPx, opts?.noOriginal === true)) {
        const url = e.urls[tier];
        if (!url) continue;
        const blob = await fetchBlob(url);
        if (!blob || blob.size > cap) continue;
        const data = new Uint8Array(await blob.arrayBuffer());
        const mime = sniff(data);
        if (mime) return { data, mime };
      }
      return null;
    },

    corsSuspected: () => networkErrors > 0 && remoteOk === 0,

    dispose() {
      for (const c of cache.values()) c.bmp.close?.();
      cache.clear();
      usedPx = 0;
    },
  };
}

/** Fetches the original file of an asset for backups and ZIPs: its bytes as a Blob and the extension its type implies. */
export function createOriginalFetcher(table: AssetTable, fetchFn: typeof fetch = (...a) => globalThis.fetch(...a)): (assetId: string) => Promise<{ blob: Blob; ext: string } | null> {
  return async (assetId) => {
    const url = table[assetId]?.urls.original;
    if (!url) return null;
    try {
      const res = await fetchFn(url, { mode: "cors", credentials: "omit" });
      if (!res.ok) return null;
      const blob = await res.blob();
      const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
      const sniffed = sniff(head);
      const type = (blob.type || sniffed || "").toLowerCase();
      const ext = type.includes("png") ? "png" : type.includes("jpeg") || type.includes("jpg") ? "jpg" : type.includes("webp") ? "webp" : type.includes("gif") ? "gif" : type.includes("mp4") ? "mp4" : type.includes("webm") ? "webm" : "bin";
      return { blob: blob.type === type ? blob : new Blob([blob], { type }), ext };
    } catch {
      return null;
    }
  };
}

const CHUNK = 0x8000;

/** `data:` URL of picture bytes, in chunks so a large picture does not blow the call stack. */
export function toDataUrl(data: Uint8Array, mime: string): string {
  let bin = "";
  for (let i = 0; i < data.length; i += CHUNK) bin += String.fromCharCode(...data.subarray(i, i + CHUNK));
  return `data:${mime};base64,${btoa(bin)}`;
}

export type SvgImageLimits = { perImageBytes: number; totalBytes: number };
export const SVG_LIMITS: SvgImageLimits = { perImageBytes: 3 * 1024 * 1024, totalBytes: 48 * 1024 * 1024 };

/** SVG picture hooks over an image source: embedded data URLs under a per-picture and a total size cap; linked URLs only for https. */
export function svgImages(source: ExportImageSource, table: AssetTable, limits: SvgImageLimits = SVG_LIMITS): SvgImages & { overCap(): number } {
  let total = 0;
  let over = 0;
  return {
    async dataUrl(assetId, neededPx = 1024, opts) {
      const got = await source.bytes(assetId, neededPx, { noOriginal: opts?.noOriginal, maxBytes: limits.perImageBytes });
      if (!got) {
        over++;
        return null;
      }
      if (total + got.data.length > limits.totalBytes) {
        over++;
        return null;
      }
      total += got.data.length;
      return toDataUrl(got.data, got.mime);
    },
    url(assetId, opts) {
      const urls = table[assetId]?.urls;
      if (!urls) return null;
      const pick = (v: AssetVariant) => (urls[v]?.startsWith("https://") ? urls[v]! : null);
      return (opts?.noOriginal ? null : pick("original")) ?? pick("w2048") ?? pick("w1024") ?? pick("w256");
    },
    overCap: () => over,
  };
}
