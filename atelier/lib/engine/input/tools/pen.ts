import { defaultsFor } from "../../model/defaults";
import type { StrokeObj } from "../../model/types";
import { beginUndoGesture, endUndoGesture } from "../undo-gesture";
import type { CanvasPointer, Tool, ToolCtx } from "../tool-machine";
import { centreOf, dist, frameIdAt, touchIgnored } from "./common";

export type PenTool = Tool & {
  id: "pen" | "highlighter";
  color: string;
  /** Stroke width in canvas units. */
  size: number;
};

/** Points closer than this (screen px) to the previous kept point are dropped. */
const MIN_POINT_DISTANCE_PX = 1.5;
const PRECISION = 100;

const round = (v: number) => Math.round(v * PRECISION) / PRECISION;

type Sample = { x: number; y: number; p: number };

/**
 * Turn absolute samples into a stroke object: x, y, w, h are the box around the points (at least 1 x 1) and the
 * points are x,y,pressure triples relative to that box's corner.
 */
export function strokeFromSamples(
  samples: readonly Sample[],
  style: { tool: "pen" | "highlighter"; color: string; size: number },
): Omit<StrokeObj, "id" | "index" | "createdAt" | "updatedAt"> {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of samples) {
    x0 = Math.min(x0, s.x);
    y0 = Math.min(y0, s.y);
    x1 = Math.max(x1, s.x);
    y1 = Math.max(y1, s.y);
  }
  const points: number[] = [];
  for (const s of samples) points.push(round(s.x - x0), round(s.y - y0), round(s.p));
  return {
    ...defaultsFor("stroke"),
    x: x0,
    y: y0,
    w: Math.max(x1 - x0, 1),
    h: Math.max(y1 - y0, 1),
    tool: style.tool,
    color: style.color,
    size: style.size,
    points,
  };
}

/**
 * Pen and highlighter. Pressure comes from the pointer (a mouse reports 0.5). The stroke is drawn live from an overlay
 * and written to the document once, on pointer up, so a long stroke is one small update and one undo step.
 */
export function createPenTool(id: "pen" | "highlighter"): PenTool {
  const style = {
    color: id === "pen" ? "var(--color-ink)" : "var(--sticky-yellow)",
    size: id === "pen" ? 4 : 20,
  };
  let samples: Sample[] | null = null;
  let last: CanvasPointer | null = null;

  const draft = (): StrokeObj => ({
    ...strokeFromSamples(samples!, { tool: id, ...style }),
    id: "draft",
    index: "a0",
    createdAt: 0,
    updatedAt: 0,
  });

  function add(e: CanvasPointer, force = false) {
    if (!samples) return;
    const prev = last;
    if (!force && prev && dist(e.screen, prev.screen) < MIN_POINT_DISTANCE_PX) return;
    samples.push({ x: e.point.x, y: e.point.y, p: e.pressure });
    last = e;
  }

  function abandon(ctx: ToolCtx) {
    samples = null;
    last = null;
    ctx.overlays.set({ draft: null });
  }

  const tool: PenTool = {
    id,
    get color() {
      return style.color;
    },
    set color(v) {
      style.color = v;
    },
    get size() {
      return style.size;
    },
    set size(v) {
      style.size = v;
    },

    onDown(ctx, e) {
      if (touchIgnored(ctx, e)) return;
      samples = [];
      last = null;
      add(e, true);
      ctx.overlays.set({ draft: draft() });
    },

    onMove(ctx, e) {
      if (!samples || e.buttons === 0) return;
      const before = samples.length;
      add(e);
      if (samples.length !== before) ctx.overlays.set({ draft: draft() });
    },

    onUp(ctx, e) {
      if (!samples) return;
      // Always keep where the stroke ended.
      if (last && (last.point.x !== e.point.x || last.point.y !== e.point.y)) add(e, true);
      const done = samples;
      samples = null;
      last = null;
      ctx.overlays.set({ draft: null });
      if (done.length === 0) return;
      const { doc } = ctx;
      beginUndoGesture(doc);
      try {
        const stroke = strokeFromSamples(done, { tool: id, ...style });
        doc.create({ ...stroke, parentId: frameIdAt(ctx, centreOf(stroke)) });
      } finally {
        endUndoGesture(doc);
      }
    },

    onCancel(ctx) {
      abandon(ctx);
    },

    onKey(ctx, e) {
      if (e.key === "Escape" && samples) {
        abandon(ctx);
        return true;
      }
      return false;
    },

    cursor() {
      return "crosshair";
    },
  };
  return tool;
}
