import type { Point, Rect } from "../../model/types";
import { frameAt } from "../transform-ops";
import { dragThreshold } from "../gestures";
import type { CanvasPointer, ToolCtx } from "../tool-machine";

/** Smallest side (canvas units) of an object created by dragging. */
export const MIN_DRAG_SIZE = 8;

export const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/** With "pen draws, finger pans" a touch never reaches a creation tool (the canvas pans instead; this is the backstop). */
export function touchIgnored(ctx: ToolCtx, e: CanvasPointer): boolean {
  return ctx.settings.penOnlyDraws && e.pointerType === "touch";
}

/** True once the pointer has moved far enough from where it went down to count as a drag. */
export function isDrag(a: CanvasPointer, b: CanvasPointer): boolean {
  return dist(a.screen, b.screen) >= dragThreshold(b.pointerType);
}

/**
 * The rectangle a drag from `from` to `to` defines. `ratio` (w / h) is kept when set, otherwise the sides are free.
 * The rectangle grows from `from` towards `to`; with a ratio the longer side leads.
 */
export function dragRect(from: Point, to: Point, ratio: number | null): Rect {
  let dx = to.x - from.x;
  let dy = to.y - from.y;
  if (ratio !== null && ratio > 0) {
    const w = Math.max(Math.abs(dx), Math.abs(dy) * ratio);
    const h = w / ratio;
    dx = Math.sign(dx || 1) * w;
    dy = Math.sign(dy || 1) * h;
  }
  const w = Math.max(Math.abs(dx), MIN_DRAG_SIZE);
  const h = Math.max(Math.abs(dy), MIN_DRAG_SIZE);
  return { x: dx < 0 ? from.x - w : from.x, y: dy < 0 ? from.y - h : from.y, w, h };
}

/** A rect of the given size centred on `p`. */
export function centredRect(p: Point, w: number, h: number): Rect {
  return { x: p.x - w / 2, y: p.y - h / 2, w, h };
}

/** The frame (smallest) that contains canvas point `p`, so a new object lands inside it. */
export function frameIdAt(ctx: ToolCtx, p: Point): string | null {
  return frameAt(ctx.doc, ctx.index, p, new Set())?.id ?? null;
}

export function centreOf(r: Rect): Point {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}
