// Learn the size and variants of the assets a board uses that this device has not seen (a board opened on a new device).
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import type { AssetMeta, AssetMetaStore } from "./meta-store";
import { isVariantName } from "./variants";

const CHUNK = 100;

function assetIdOf(obj: { type: string } & Record<string, unknown>): string | null {
  return (obj.type === "image" || obj.type === "video") && typeof obj.assetId === "string" ? obj.assetId : null;
}

/** Ids of assets used by `ids` (or by the whole board) that `meta` does not know yet. */
export function unknownAssetIds(doc: BoardDoc, meta: AssetMetaStore, ids?: Iterable<string>): string[] {
  const out = new Set<string>();
  const objs = ids ? [...ids].map((i) => doc.get(i)) : doc.all();
  for (const o of objs) {
    if (!o) continue;
    const a = assetIdOf(o as never);
    if (a && !meta.get(a)) out.add(a);
  }
  return [...out];
}

function toMeta(v: unknown): AssetMeta | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== "string") return null;
  if (r.kind !== "image" && r.kind !== "video" && r.kind !== "gif") return null;
  if (typeof r.width !== "number" || typeof r.height !== "number" || !(r.width > 0) || !(r.height > 0)) return null;
  return {
    id: r.id,
    kind: r.kind,
    width: r.width,
    height: r.height,
    bytes: typeof r.bytes === "number" ? r.bytes : 0,
    variants: Array.isArray(r.variants) ? r.variants.filter(isVariantName) : [],
    palette: Array.isArray(r.palette) ? (r.palette as { hex: string; weight: number }[]) : null,
    phash: typeof r.phash === "string" ? r.phash : null,
    title: typeof r.title === "string" ? r.title : "",
    provenance: null,
    analysisVersion: typeof r.analysisVersion === "number" ? r.analysisVersion : 0,
  };
}

/**
 * Ask the server (`GET /api/assets?ids=`) about the assets the board uses and the store does not know, 100 at a time, and
 * put the answers in the store (which tells the canvas, so images switch from the Phase 1 guess to the real variants).
 * Never throws: offline or a failing server leaves the guess in place. Does nothing in local-only mode.
 */
export async function hydrateBoardAssets(opts: {
  doc: BoardDoc;
  meta: AssetMetaStore;
  fetchFn?: typeof fetch;
  localOnly?: boolean;
  /** Only these objects' assets (changes after the first call). */
  ids?: Iterable<string>;
}): Promise<void> {
  if (opts.localOnly) return;
  const fetchFn = opts.fetchFn ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const missing = unknownAssetIds(opts.doc, opts.meta, opts.ids);
  for (let i = 0; i < missing.length; i += CHUNK) {
    const chunk = missing.slice(i, i + CHUNK);
    try {
      const res = await fetchFn(`/api/assets?ids=${chunk.join(",")}`, { cache: "no-store" });
      if (!res.ok) continue;
      const body = (await res.json()) as { assets?: unknown };
      if (!Array.isArray(body.assets)) continue;
      for (const row of body.assets) {
        const m = toMeta(row);
        if (m && chunk.includes(m.id) && !opts.meta.get(m.id)) opts.meta.put(m);
      }
    } catch {
      /* offline, or not JSON: keep the guess */
    }
  }
}

/**
 * Like hydrateBoardAssets, for a plain list of asset ids (the Inbox, which has no board): asks `GET /api/assets?ids=` for
 * the ones the store does not know, 100 at a time, and stores the answers. Never throws; does nothing in local-only mode.
 */
export async function hydrateAssetIds(opts: { ids: Iterable<string>; meta: AssetMetaStore; fetchFn?: typeof fetch; localOnly?: boolean }): Promise<void> {
  if (opts.localOnly) return;
  const fetchFn = opts.fetchFn ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const missing = [...new Set(opts.ids)].filter((id) => !opts.meta.get(id));
  for (let i = 0; i < missing.length; i += CHUNK) {
    const chunk = missing.slice(i, i + CHUNK);
    try {
      const res = await fetchFn(`/api/assets?ids=${chunk.join(",")}`, { cache: "no-store" });
      if (!res.ok) continue;
      const body = (await res.json()) as { assets?: unknown };
      if (!Array.isArray(body.assets)) continue;
      for (const row of body.assets) {
        const m = toMeta(row);
        if (m && chunk.includes(m.id) && !opts.meta.get(m.id)) opts.meta.put(m);
      }
    } catch {
      /* offline: the thumbnails keep their guess */
    }
  }
}
