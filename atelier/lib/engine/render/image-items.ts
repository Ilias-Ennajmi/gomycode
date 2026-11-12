// Turns image objects of a board into ImageLayer items. Pure: no DOM, no React.
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import type { CanvasObject, ImageObj } from "@/lib/engine/model/types";
import type { ImageLayerItem } from "./image-layer";
import { nodeZ } from "./z-order";

const MAX_DEPTH = 16;

/**
 * z-index of an object drawn by React. Groups are invisible, so a group's children sit where the group sits among its
 * siblings; a frame hosts its children in its own stacking context, so the walk stops there.
 */
export function objectZ(doc: Pick<BoardDoc, "get">, obj: CanvasObject): number {
  let index = obj.index;
  let parentId = obj.parentId;
  for (let depth = 0; parentId && depth < MAX_DEPTH; depth++) {
    const parent = doc.get(parentId);
    if (!parent || parent.type === "frame") break;
    if (parent.type === "group") index = parent.index;
    parentId = parent.parentId;
  }
  return nodeZ(index);
}

/**
 * z base of an image: where its object would sit, except that inside a frame it is one above the frame (over the frame's
 * own drawing, under the next object); the image layer ranks the images that share a base by their own index.
 */
export function imageZ(doc: Pick<BoardDoc, "get">, obj: CanvasObject): number {
  let parentId = obj.parentId;
  for (let depth = 0; parentId && depth < MAX_DEPTH; depth++) {
    const parent = doc.get(parentId);
    if (!parent) break;
    if (parent.type === "frame") return objectZ(doc, parent) + 1;
    parentId = parent.parentId;
  }
  return objectZ(doc, obj);
}

export interface ImageItemOptions {
  /** Board-wide grayscale preview (`meta.valueCheck`). */
  valueCheck?: boolean;
  /** Credits overlay text for an image (Task 16); null = none. */
  captionFor?: (obj: ImageObj) => string | null;
}

/** Items for the image objects among `ids` (other types are skipped), in the order given. */
export function buildImageItems(doc: Pick<BoardDoc, "get">, ids: readonly string[], opts: ImageItemOptions = {}): ImageLayerItem[] {
  const out: ImageLayerItem[] = [];
  for (const id of ids) {
    const obj = doc.get(id);
    if (!obj || obj.type !== "image") continue;
    out.push({
      id: obj.id,
      assetId: obj.assetId,
      rect: { x: obj.x, y: obj.y, w: obj.w, h: obj.h },
      rotation: obj.rotation,
      crop: obj.crop,
      mask: obj.mask,
      flipX: obj.flipX,
      flipY: obj.flipY,
      grayscale: obj.grayscale || opts.valueCheck === true,
      opacity: obj.opacity,
      zIndexKey: obj.index,
      caption: opts.captionFor?.(obj) ?? null,
      z: imageZ(doc, obj),
    });
  }
  return out;
}
