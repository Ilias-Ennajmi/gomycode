import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { Point, Provenance } from "@/lib/engine/model/types";
import { isAssetId } from "./asset-id";
import { fitWithin } from "./pipeline-core";

/** Longest side of a freshly placed picture on the canvas, in canvas units (the same as a dropped file). */
export const PLACED_SIDE = 320;

export type PlaceableAsset = {
  assetId: string;
  kind: "image" | "gif" | "video";
  width: number;
  height: number;
  provenance?: Provenance | null;
};

const positive = (n: number, fallback: number) => (Number.isFinite(n) && n > 0 ? n : fallback);

/**
 * Put an asset that already exists (the library, the Inbox) on the board, centred on `at`, as an image or a video / gif
 * object. Nothing is uploaded: the object points at the same asset every other board uses. One undo step. Returns the id.
 */
export function placeAsset(doc: BoardDoc, a: PlaceableAsset, at: Point): string {
  const size = fitWithin(positive(a.width, PLACED_SIDE), positive(a.height, PLACED_SIDE), PLACED_SIDE);
  const base = { assetId: a.assetId, x: at.x - size.w / 2, y: at.y - size.h / 2, w: size.w, h: size.h, provenance: a.provenance ?? null };
  return doc.create(
    a.kind === "image"
      ? { ...defaultsFor("image"), ...base }
      : { ...defaultsFor("video"), ...base, kind: a.kind, loop: a.kind === "gif", muted: true, posterTime: 0 },
  );
}

/** Whether an object on the board already uses this asset (image, or a video or its poster). */
export function assetOnBoard(doc: BoardDoc, assetId: string): boolean {
  return doc.all().some((o) => (o.type === "image" && o.assetId === assetId) || (o.type === "video" && (o.assetId === assetId || o.posterAssetId === assetId)));
}

// ---- "Add to board" from the library -------------------------------------------------------------------------

export type AddRequest = { assetId: string; kind: "image" | "gif" | "video"; width: number; height: number };

/** The board URL that asks the editor to place this asset in the middle of the view once it has opened. */
export function addRequestHref(boardId: string, a: AddRequest): string {
  const p = new URLSearchParams({ add: a.assetId, ak: a.kind, aw: String(Math.round(a.width)), ah: String(Math.round(a.height)) });
  return `/b/${encodeURIComponent(boardId)}?${p}`;
}

/** Reads the request back from `location.search`; null unless every part is valid. */
export function parseAddRequest(search: string): AddRequest | null {
  const p = new URLSearchParams(search);
  const assetId = p.get("add");
  const kind = p.get("ak");
  const width = Number(p.get("aw"));
  const height = Number(p.get("ah"));
  if (!isAssetId(assetId) || (kind !== "image" && kind !== "gif" && kind !== "video")) return null;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 65_535 || height > 65_535) return null;
  return { assetId, kind, width, height };
}
