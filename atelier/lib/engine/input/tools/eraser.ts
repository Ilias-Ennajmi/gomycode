import { boundsOf } from "../../geometry/rect";
import { hitTest } from "../../geometry/hit";
import type { Point } from "../../model/types";
import { beginUndoGesture, endUndoGesture } from "../undo-gesture";
import type { CanvasPointer, Tool, ToolCtx } from "../tool-machine";
import { dist, touchIgnored } from "./common";

/** Eraser radius in screen px. */
const RADIUS_PX = 8;

/**
 * Removes the strokes the pointer crosses, and only strokes: stickies, shapes and the rest stay. The path between two
 * pointer events is sampled so a fast drag does not skip over a thin line. One drag is one undo step.
 */
export function createEraserTool(): Tool {
  let active: { prev: Point; undoOpen: boolean } | null = null;

  function sweep(ctx: ToolCtx, from: Point, to: Point) {
    const z = ctx.camera().z;
    const r = RADIUS_PX / z;
    const area = {
      x: Math.min(from.x, to.x) - r,
      y: Math.min(from.y, to.y) - r,
      w: Math.abs(from.x - to.x) + 2 * r,
      h: Math.abs(from.y - to.y) + 2 * r,
    };
    const stepLen = Math.max(r / 2, 0.25 / z);
    const steps = Math.max(1, Math.ceil(dist(from, to) / stepLen));
    const doomed: string[] = [];
    for (const id of ctx.index.search(area)) {
      const o = ctx.doc.get(id);
      if (!o || o.type !== "stroke" || o.locked) continue;
      const b = boundsOf(o);
      if (b.x > area.x + area.w + o.size || b.x + b.w < area.x - o.size) continue;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const p = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
        if (hitTest(o, p, r)) {
          doomed.push(id);
          break;
        }
      }
    }
    if (doomed.length > 0) ctx.doc.remove(doomed);
  }

  function end(ctx: ToolCtx) {
    if (active?.undoOpen) endUndoGesture(ctx.doc);
    active = null;
  }

  return {
    id: "eraser",

    onDown(ctx, e: CanvasPointer) {
      if (touchIgnored(ctx, e)) return;
      active = { prev: e.point, undoOpen: true };
      beginUndoGesture(ctx.doc);
      sweep(ctx, e.point, e.point);
    },

    onMove(ctx, e) {
      if (!active || e.buttons === 0) return;
      sweep(ctx, active.prev, e.point);
      active.prev = e.point;
    },

    onUp(ctx, e) {
      if (!active) return;
      sweep(ctx, active.prev, e.point);
      end(ctx);
    },

    onCancel(ctx) {
      end(ctx); // what was already erased stays erased (it is one undo step)
    },

    cursor() {
      return "cell";
    },
  };
}
