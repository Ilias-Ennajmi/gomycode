import type { Provenance } from "@/lib/engine/model/types";
import { getAssetMetaStore, type AssetMetaStore } from "./meta-store";

/**
 * Tell the server an asset's provenance (PATCH /api/assets/:id) and remember it on this device. Local-only mode (503) and a
 * server that has not seen the asset yet (404) are not errors: the board object holds the provenance either way. Throws
 * for other failures so the caller may decide to retry later.
 */
export async function patchAssetProvenance(assetId: string, p: Provenance, opts: { fetch?: typeof fetch; meta?: AssetMetaStore } = {}): Promise<void> {
  const f = opts.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const res = await f(`/api/assets/${encodeURIComponent(assetId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provenance: p }),
  });
  const tolerated = res.status === 503 || res.status === 404;
  if (!res.ok && !tolerated) throw new Error(`Saving the source failed (${res.status})`);
  const meta = opts.meta ?? getAssetMetaStore();
  const known = meta.get(assetId);
  if (known) meta.put({ ...known, provenance: p });
}

/** Whether the asset already has a source, credit or licence on file (known to this device). */
export function assetHasProvenance(assetId: string, meta: Pick<AssetMetaStore, "get"> = getAssetMetaStore()): boolean {
  const p = meta.get(assetId)?.provenance;
  return !!p && (!!p.sourceUrl || !!p.credit || !!p.licence);
}
