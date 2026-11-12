// Frames as slides. Pure: no DOM, no document, no editor imports, so the share viewer can use it as it is.
import { fitRect, type Camera } from "../geometry/camera";
import { boundsOf } from "../geometry/rect";
import type { FrameObj, Rect } from "../model/types";

/** What a slide needs from a frame. Both the owner's `FrameObj` and a visitor's redacted frame fit it. */
export type SlideFrame = Pick<FrameObj, "id" | "x" | "y" | "w" | "h" | "rotation" | "parentId" | "index" | "name" | "order" | "notes">;

/** One slide: `rect` is the frame's bounding box on the canvas (a rotated frame is presented by its box). */
export type Slide = { id: string; index: number; name: string; rect: Rect; notes: string };

export type Viewport = { w: number; h: number };

/** Screen padding around a slide: 3 % of the short side. */
export const SLIDE_PADDING_RATIO = 0.03;

const has = (order: string): boolean => order.trim() !== "";

/** Code-unit comparison: the same order every replica computes (never `localeCompare`). */
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The top-level frames in presentation order: by `order`, then by z-index, then by id. Frames without an order sort
 * after every frame that has one, so a frame added by an older client is appended rather than lost. Frames inside other
 * objects are not slides. Unnamed frames are called "Slide n".
 */
export function slidesOf(frames: readonly SlideFrame[]): Slide[] {
  // A caller may pass a mixed list of objects: anything that says it is not a frame is skipped.
  const top = frames.filter((f) => ((f as { type?: string }).type ?? "frame") === "frame" && f.parentId === null);
  const sorted = [...top].sort((a, b) => {
    const oa = has(a.order);
    const ob = has(b.order);
    if (oa !== ob) return oa ? -1 : 1;
    return (oa ? cmp(a.order, b.order) : 0) || cmp(a.index, b.index) || cmp(a.id, b.id);
  });
  return sorted.map((f, i) => ({
    id: f.id,
    index: i,
    name: f.name.trim() === "" ? `Slide ${i + 1}` : f.name,
    rect: boundsOf(f),
    notes: f.notes,
  }));
}

/** The name the share viewer uses for the same function. */
export const orderedSlides = slidesOf;

const finite = (v: number, fallback: number): number => (Number.isFinite(v) ? v : fallback);

/**
 * The camera that shows `rect` whole and centred with `padding` screen px around it (default 3 % of the short side).
 * The aspect ratio is kept: the longer side of the viewport is letterboxed. Never zoomed past the camera limits.
 */
export function slideCamera(rect: Rect, viewport: Viewport, padding?: number): Camera {
  const vp = { w: Math.max(finite(viewport.w, 1), 1), h: Math.max(finite(viewport.h, 1), 1) };
  const pad = padding === undefined ? SLIDE_PADDING_RATIO * Math.min(vp.w, vp.h) : padding;
  return fitRect(rect, vp, pad, 32);
}

export function cameraForSlide(s: Slide, viewport: Viewport, padding?: number): Camera {
  return slideCamera(s.rect, viewport, padding);
}

/** An index forced into 0..count-1 (0 when there are no slides). */
export function clamp(i: number, count: number): number {
  if (!Number.isFinite(i) || count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.trunc(i)));
}

/** The index one step on (`dir` 1) or back (`dir` -1). Stops at the ends: a deck does not wrap. */
export function nextIndex(i: number, count: number, dir: 1 | -1): number {
  return clamp(i + dir, count);
}

export function slideIndexOf(slides: readonly Slide[], id: string): number {
  return slides.findIndex((s) => s.id === id);
}

/** The text for the polite live region: "Slide 2 of 5: Direction A". */
export function slideAnnouncement(index: number, count: number, name: string): string {
  if (count <= 0) return "No slides";
  return `Slide ${index + 1} of ${count}: ${name}`;
}
