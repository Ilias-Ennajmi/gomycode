import { placeAsset, type PlaceableAsset } from "@/lib/assets/place-asset";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { insertPaste } from "@/lib/engine/clipboard/parse";
import type { LinkCardDeps } from "@/lib/engine/links/link-cards";
import type { Point, Provenance } from "@/lib/engine/model/types";
import { extractProvenance } from "@/lib/engine/provenance/extract";
import type { InboxItem } from "./types";

export type PlaceDeps = {
  /** What is known about an asset (size, kind, its own provenance); null = nothing known yet. */
  assetInfo(assetId: string): { kind: "image" | "gif" | "video"; width: number; height: number; provenance: Provenance | null } | null;
  /** Tell the Inbox the item is placed (InboxClient.markPlaced). */
  markPlaced(id: string): void | Promise<unknown>;
  /** Link-card preview support; without it a link becomes a plain card with just its domain. */
  links?: LinkCardDeps | null;
};

const FALLBACK_SIDE = 320;
const marked = new WeakMap<PlaceDeps, Set<string>>();

/**
 * Provenance for a picture placed from the Inbox: what the asset already records wins, field by field; the item's source
 * link and credit fill the gaps (through extractProvenance, so only an http(s) link is ever copied, dated with the day the
 * item was captured). Null when there is nothing worth recording.
 */
function provenanceFor(item: InboxItem, own: Provenance | null): Provenance | null {
  const fromItem = extractProvenance({ url: item.sourceUrl ?? undefined, now: new Date(item.createdAt) });
  const credit = (item.credit ?? "").trim();
  const merged: Provenance = {
    sourceUrl: own?.sourceUrl ?? fromItem.sourceUrl ?? null,
    credit: own?.credit || credit,
    licence: own?.licence ?? "",
    capturedAt: own?.capturedAt ?? fromItem.capturedAt ?? null,
  };
  return merged.sourceUrl || merged.credit || merged.licence ? merged : null;
}

/**
 * Put one Inbox item on a board, centred on `at`, as one undo step; returns the ids created ([] when nothing could be made,
 * in which case the item is left unplaced). A picture or video points at the asset it already has (no upload); a link becomes an
 * embed (YouTube, Vimeo, Figma) or a link card; a note becomes a text object. Then the Inbox is told, once per item per
 * `deps`: placing the same item again makes more objects but does not mark it again.
 */
export function placeInboxItem(doc: BoardDoc, item: InboxItem, at: Point, deps: PlaceDeps): string[] {
  let ids: string[] = [];
  doc.transact(() => {
    if (item.kind === "image" || item.kind === "video") {
      if (!item.assetId) return;
      const info = deps.assetInfo(item.assetId);
      const asset: PlaceableAsset = {
        assetId: item.assetId,
        kind: info?.kind ?? (item.kind === "video" ? "video" : "image"),
        width: info?.width ?? FALLBACK_SIDE,
        height: info?.height ?? FALLBACK_SIDE,
        provenance: provenanceFor(item, info?.provenance ?? null),
      };
      ids = [placeAsset(doc, asset, at)];
    } else if (item.kind === "url") {
      const url = item.url?.trim();
      if (url) ids = insertPaste(doc, [{ kind: "url", url }], at, { links: deps.links ?? undefined });
    } else {
      const text = (item.text ?? "").trim() || (item.title ?? "").trim();
      if (text) ids = insertPaste(doc, [{ kind: "text", text, lines: text.split(/\r?\n/).length }], at);
    }
  });
  if (ids.length > 0 && !item.placedAt) {
    const seen = marked.get(deps) ?? marked.set(deps, new Set()).get(deps)!;
    if (!seen.has(item.id)) {
      seen.add(item.id);
      void Promise.resolve(deps.markPlaced(item.id)).catch(() => seen.delete(item.id));
    }
  }
  return ids;
}
