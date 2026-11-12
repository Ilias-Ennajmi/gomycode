import type { Rect } from "../../model/types";
import { beginUndoGesture, endUndoGesture } from "../undo-gesture";
import type { CanvasPointer, Tool, ToolCtx, ToolId } from "../tool-machine";
import { dragRect, isDrag, touchIgnored } from "./common";

export type DragCreateSpec = {
  id: ToolId;
  cursor: string;
  /** The rectangle of a plain click at the pointer. */
  clickRect(ctx: ToolCtx, e: CanvasPointer): Rect;
  /** Width / height to keep while Shift is held, or null for a free rectangle. */
  ratio(): number | null;
  /** Write the object (inside the undo gesture) and return its id. */
  create(ctx: ToolCtx, rect: Rect, dragged: boolean, e: CanvasPointer): string;
  /** After the object exists and is selected. `undoDepth` is the undo depth from before it was created. */
  after?(ctx: ToolCtx, id: string, undoDepth: number): void;
};

type Gesture = { start: CanvasPointer; dragging: boolean };

/**
 * Click to place a default-size object, drag to size it (Shift keeps the ratio). The new object is selected, and the
 * tool hands back to Select unless it is locked. The whole creation is one undo step, separate from what follows.
 */
export function dragCreateTool(spec: DragCreateSpec): Tool {
  let g: Gesture | null = null;

  function abandon(ctx: ToolCtx) {
    if (!g) return;
    g = null;
    ctx.overlays.reset();
  }

  return {
    id: spec.id,

    onDown(ctx, e) {
      if (touchIgnored(ctx, e)) return;
      g = { start: e, dragging: false };
    },

    onMove(ctx, e) {
      if (!g || e.buttons === 0) return;
      if (!g.dragging && !isDrag(g.start, e)) return;
      g.dragging = true;
      ctx.overlays.set({ marquee: dragRect(g.start.point, e.point, e.shiftKey ? spec.ratio() : null) });
    },

    onUp(ctx, e) {
      if (!g) return;
      const gesture = g;
      g = null;
      ctx.overlays.reset();
      const rect = gesture.dragging
        ? dragRect(gesture.start.point, e.point, e.shiftKey ? spec.ratio() : null)
        : spec.clickRect(ctx, gesture.start);
      const { doc } = ctx;
      const depth = doc.undoManager.undoStack.length;
      beginUndoGesture(doc);
      let id: string;
      try {
        id = spec.create(ctx, rect, gesture.dragging, e);
      } finally {
        endUndoGesture(doc);
      }
      ctx.selection.set([id]);
      ctx.finishTool();
      spec.after?.(ctx, id, depth);
    },

    onCancel(ctx) {
      abandon(ctx);
    },

    onKey(ctx, e) {
      if (e.key === "Escape" && g) {
        abandon(ctx);
        return true;
      }
      return false;
    },

    cursor() {
      return spec.cursor;
    },
  };
}
