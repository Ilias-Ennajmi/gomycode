import type { BoardDoc } from "../doc/board-doc";
import { oneStepOn } from "../model/one-step";
import type { ImageObj, Rect } from "../model/types";
import { clampCrop, cropForReplacement, cropPixelAspect, isFullCrop, type Size } from "./crop";

export { maskRadii } from "./crop";

/** Something that can tell the pixel size of an asset (the asset resolver). */
export type SourceSizes = { available(assetId: string): { width: number; height: number } | null };

/**
 * The source pixel size of an image. Only the aspect matters to the crop maths: when the real size is not known yet
 * it is derived from the object's box and crop.
 */
export function imageSource(obj: Pick<ImageObj, "assetId" | "w" | "h" | "crop">, assets?: SourceSizes): Size {
  const known = assets?.available(obj.assetId);
  if (known && known.width > 0 && known.height > 0) return { w: known.width, h: known.height };
  const c = obj.crop && obj.crop.w > 0 && obj.crop.h > 0 ? obj.crop : { w: 1, h: 1 };
  const boxAspect = obj.w > 0 && obj.h > 0 ? obj.w / obj.h : 1;
  return { w: (boxAspect * c.h) / c.w, h: 1 };
}

const editable = (doc: BoardDoc, id: string): ImageObj | null => {
  const o = doc.get(id);
  return o && o.type === "image" && !o.locked ? o : null;
};

const editableImages = (doc: BoardDoc, ids: Iterable<string>): ImageObj[] => [...ids].flatMap((id) => editable(doc, id) ?? []);

/**
 * Crop an image non-destructively: sets `crop` (normalised to the source; null = whole image) and fits the box height
 * to the window's pixel aspect, keeping x, y and width. One undo step.
 */
export function applyCrop(doc: BoardDoc, id: string, crop: Rect | null, src: Size): void {
  const o = editable(doc, id);
  if (!o) return;
  const next = crop && !isFullCrop(crop) ? clampCrop(crop) : null;
  const h = Math.max(1, o.w / cropPixelAspect(src, next));
  oneStepOn(doc, () => doc.update(id, { crop: next, h }));
}

/** `merge` folds the write into the previous undo step (a slider drag or arrow-key steps). */
export function setMask(doc: BoardDoc, ids: string[], mask: ImageObj["mask"], opts: { merge?: boolean } = {}): void {
  const radius = Number.isFinite(mask.radius) ? Math.max(0, mask.radius) : 0;
  const targets = editableImages(doc, ids);
  if (targets.length === 0) return;
  const write = () => targets.forEach((o) => doc.update(o.id, { mask: { kind: mask.kind, radius } }));
  if (opts.merge) doc.transact(write);
  else oneStepOn(doc, write);
}

export function setGrayscale(doc: BoardDoc, ids: string[], on: boolean): void {
  const targets = editableImages(doc, ids);
  if (targets.length === 0) return;
  oneStepOn(doc, () => targets.forEach((o) => doc.update(o.id, { grayscale: on })));
}

/** Toggle the mirror of each image (not of other objects), in place. */
export function flipImages(doc: BoardDoc, ids: string[], axis: "x" | "y"): void {
  const targets = editableImages(doc, ids);
  if (targets.length === 0) return;
  oneStepOn(doc, () =>
    targets.forEach((o) => doc.update(o.id, axis === "x" ? { flipX: !o.flipX } : { flipY: !o.flipY })),
  );
}

/** Point an image at another asset, keeping its box, mask, opacity and (as far as the new picture allows) crop. One undo step. */
export function replaceImageAsset(doc: BoardDoc, id: string, newAssetId: string, oldSrc: Size, newSrc: Size): void {
  const o = editable(doc, id);
  if (!o) return;
  const crop = cropForReplacement(o, oldSrc, newSrc);
  oneStepOn(doc, () => doc.update(id, { assetId: newAssetId, crop: isFullCrop(crop) ? null : crop }));
}
