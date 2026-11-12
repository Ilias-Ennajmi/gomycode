import type { Handle } from "../geometry/transform";
import { maskRadii } from "../model/image-style";
import type { ImageObj, Rect } from "../model/types";

export { maskRadii };

export type CropPresetId = "free" | "1:1" | "4:5" | "3:4" | "16:9" | "9:16";

/** Aspect presets of the crop tool. `ratio` is width / height in source pixels; null is free. */
export const CROP_PRESETS: { id: CropPresetId; label: string; ratio: number | null }[] = [
  { id: "free", label: "Free", ratio: null },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:5", label: "4:5", ratio: 4 / 5 },
  { id: "3:4", label: "3:4", ratio: 3 / 4 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
];

export type Size = { w: number; h: number };
export const MIN_CROP = 0.02;
const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };

const fin = (v: number, d: number) => (Number.isFinite(v) ? v : d);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Inside [0,1] with a side of at least 0.02. Never NaN. */
export function clampCrop(r: Rect): Rect {
  const w = clamp(fin(r.w, 1), MIN_CROP, 1);
  const h = clamp(fin(r.h, 1), MIN_CROP, 1);
  return { x: clamp(fin(r.x, 0), 0, 1 - w), y: clamp(fin(r.y, 0), 0, 1 - h), w, h };
}

export const isFullCrop = (r: Rect | null): boolean => !r || (Math.abs(r.x) < 1e-9 && Math.abs(r.y) < 1e-9 && Math.abs(r.w - 1) < 1e-9 && Math.abs(r.h - 1) < 1e-9);

const srcAspect = (src: Size) => (src.w > 0 && src.h > 0 ? src.w / src.h : 1);

/** Width / height in source pixels of the window `crop` (null = the whole image). */
export function cropPixelAspect(src: Size, crop: Rect | null): number {
  const c = crop && crop.w > 0 && crop.h > 0 ? crop : FULL;
  return (c.w * srcAspect(src)) / c.h;
}

/**
 * The largest normalised window with that pixel ratio, centred on the current crop's centre (the image's centre
 * without one) and moved back inside the image. A null ratio keeps the current crop.
 */
export function cropForAspect(src: Size, current: Rect | null, ratio: number | null): Rect {
  if (ratio === null || !(ratio > 0) || !Number.isFinite(ratio)) return current ? { ...current } : { ...FULL };
  const a = srcAspect(src);
  // Normalised w / h of a window whose pixel ratio is `ratio`.
  const rn = ratio / a;
  let w = 1;
  let h = w / rn;
  if (h > 1) {
    h = 1;
    w = h * rn;
  }
  const cx = current ? current.x + current.w / 2 : 0.5;
  const cy = current ? current.y + current.h / 2 : 0.5;
  return { x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h), w, h };
}

/**
 * Crop for a replacement picture: the box keeps its aspect (`old.w / old.h`), the window keeps the old window's
 * centre and area fraction, and is clamped inside the new image.
 */
export function cropForReplacement(old: Pick<ImageObj, "w" | "h" | "crop">, oldSrc: Size, newSrc: Size): Rect {
  void oldSrc;
  const boxAspect = old.w > 0 && old.h > 0 ? old.w / old.h : srcAspect(newSrc);
  const rn = boxAspect / srcAspect(newSrc); // normalised w / h of a window with the box's pixel aspect
  const frac = old.crop ? clamp(fin(old.crop.w * old.crop.h, 1), MIN_CROP * MIN_CROP, 1) : 1;
  let w = Math.sqrt(frac * rn);
  let h = Math.sqrt(frac / rn);
  const over = Math.max(w, h, 1);
  w /= over;
  h /= over;
  const cx = old.crop ? old.crop.x + old.crop.w / 2 : 0.5;
  const cy = old.crop ? old.crop.y + old.crop.h / 2 : 0.5;
  const out = { x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h), w, h };
  return [out.x, out.y, out.w, out.h].every(Number.isFinite) ? out : { ...FULL };
}

/** Move the window by (dx, dy) (normalised), keeping its size and staying inside the image. */
export function moveCropWindow(win: Rect, dx: number, dy: number): Rect {
  return { x: clamp(win.x + fin(dx, 0), 0, 1 - win.w), y: clamp(win.y + fin(dy, 0), 0, 1 - win.h), w: win.w, h: win.h };
}

/**
 * Drag `handle` of the window by (dx, dy) in normalised units. `ratio` is the pixel width / height to keep (null =
 * free). The window stays inside the image and never gets smaller than 0.02 on a side.
 */
export function resizeCropWindow(win: Rect, handle: Handle, dx: number, dy: number, o: { src: Size; ratio: number | null }): Rect {
  dx = fin(dx, 0);
  dy = fin(dy, 0);
  const west = handle.includes("w");
  const east = handle.includes("e");
  const north = handle.includes("n");
  const south = handle.includes("s");

  if (o.ratio === null || !(o.ratio > 0)) {
    let l = win.x;
    let r = win.x + win.w;
    let t = win.y;
    let b = win.y + win.h;
    if (west) l = clamp(l + dx, 0, r - MIN_CROP);
    if (east) r = clamp(r + dx, l + MIN_CROP, 1);
    if (north) t = clamp(t + dy, 0, b - MIN_CROP);
    if (south) b = clamp(b + dy, t + MIN_CROP, 1);
    return { x: l, y: t, w: r - l, h: b - t };
  }

  const rn = o.ratio / srcAspect(o.src); // normalised w / h
  const corner = (west || east) && (north || south);
  // Fixed anchor: the opposite corner / edge middle.
  const ax = west ? win.x + win.w : east ? win.x : win.x + win.w / 2;
  const ay = north ? win.y + win.h : south ? win.y : win.y + win.h / 2;
  const room = (fixed: number, dir: number) => (dir > 0 ? 1 - fixed : dir < 0 ? fixed : 2 * Math.min(fixed, 1 - fixed));
  const dirX = west ? -1 : east ? 1 : 0;
  const dirY = north ? -1 : south ? 1 : 0;

  let w: number;
  if (corner) {
    const wx = Math.abs(win.w + dirX * dx);
    const wy = Math.abs(win.h + dirY * dy) * rn;
    w = Math.max(wx, wy);
  } else if (dirX !== 0) {
    w = Math.abs(win.w + dirX * dx);
  } else {
    w = Math.abs(win.h + dirY * dy) * rn;
  }
  w = Math.max(w, MIN_CROP, MIN_CROP * rn);
  let h = w / rn;
  // Fit inside the room on both axes.
  const limitW = room(ax, dirX);
  const limitH = room(ay, dirY);
  const scale = Math.min(1, limitW / w, limitH / h);
  w *= scale;
  h *= scale;

  const x = dirX < 0 ? ax - w : dirX > 0 ? ax : ax - w / 2;
  const y = dirY < 0 ? ay - h : dirY > 0 ? ay : ay - h / 2;
  return { x: clamp(x, 0, 1 - w), y: clamp(y, 0, 1 - h), w, h };
}
