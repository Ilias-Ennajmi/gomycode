import type { CSSProperties } from "react";
import type { ImageObj, Rect } from "./types";

/**
 * Pure description of how an image object looks: crop, mask, flip and grayscale. Both the DOM view and any other
 * image layer read this, so they cannot disagree. No DOM, no React runtime.
 */

/** Corner radii of an image's mask, in canvas px. Rect has none; rounded is clamped to half the short side. */
export function maskRadii(img: Pick<ImageObj, "w" | "h" | "mask">): { rx: number; ry: number } {
  const w = Number.isFinite(img.w) ? Math.max(0, img.w) : 0;
  const h = Number.isFinite(img.h) ? Math.max(0, img.h) : 0;
  switch (img.mask.kind) {
    case "circle":
      return { rx: w / 2, ry: h / 2 };
    case "rounded": {
      const r = Math.min(Number.isFinite(img.mask.radius) ? Math.max(0, img.mask.radius) : 0, w / 2, h / 2);
      return { rx: r, ry: r };
    }
    default:
      return { rx: 0, ry: 0 };
  }
}

/** A crop given in source space, as it appears in the displayed (flipped) picture. The mapping is its own inverse. */
export function toDisplayCrop(crop: Rect, flipX: boolean, flipY: boolean): Rect {
  return { x: flipX ? 1 - (crop.x + crop.w) : crop.x, y: flipY ? 1 - (crop.y + crop.h) : crop.y, w: crop.w, h: crop.h };
}

const usable = (c: Rect | null): c is Rect => !!c && c.w > 0 && c.h > 0 && [c.x, c.y, c.w, c.h].every(Number.isFinite);

/** Container style: the mask (a border radius) clips the picture. */
export function imageClip(obj: Pick<ImageObj, "w" | "h" | "mask">): CSSProperties {
  const { rx, ry } = maskRadii(obj);
  return rx > 0 || ry > 0 ? { overflow: "hidden", borderRadius: `${rx}px / ${ry}px` } : { overflow: "hidden" };
}

/**
 * Style of the picture inside the object's box. `crop` is normalised to the source image; with a crop the whole
 * image is laid out larger than the box and offset so the crop window sits in the box. A flip mirrors the picture
 * and the window follows it. `valueCheck` is the board-wide grayscale preview.
 */
export function imageStyle(obj: ImageObj, valueCheck: boolean): CSSProperties {
  const flipped = obj.flipX || obj.flipY;
  const transform = flipped ? `scale(${obj.flipX ? -1 : 1}, ${obj.flipY ? -1 : 1})` : undefined;
  const filter = obj.grayscale || valueCheck ? "grayscale(1)" : undefined;
  if (!usable(obj.crop)) {
    return { width: "100%", height: "100%", objectFit: "cover", display: "block", transform, filter, userSelect: "none" };
  }
  const c = toDisplayCrop(obj.crop, obj.flipX, obj.flipY);
  return {
    position: "absolute",
    width: obj.w / c.w,
    height: obj.h / c.h,
    left: (-c.x / c.w) * obj.w + 0,
    top: (-c.y / c.h) * obj.h + 0,
    maxWidth: "none",
    transform,
    filter,
    userSelect: "none",
  };
}
