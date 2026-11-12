import { defaultsFor } from "../../model/defaults";
import type { Tool } from "../tool-machine";
import { frameIdAt } from "./common";
import { dragCreateTool } from "./drag-create";

export type TextTool = Tool;

/** Width of an empty auto-width text box (it grows with what is typed). */
const EMPTY_WIDTH = 16;

/**
 * Click: an auto-width text box whose first line sits on the pointer; drag: a text box of that width that wraps and
 * grows downwards. Editing starts right away; leaving it empty removes the box again.
 */
export function createTextTool(): TextTool {
  const base = defaultsFor("text");
  return dragCreateTool({
    id: "text",
    cursor: "text",
    clickRect: (_ctx, e) => ({ x: e.point.x, y: e.point.y - base.h / 2, w: EMPTY_WIDTH, h: base.h }),
    ratio: () => null,
    create(ctx, rect, dragged) {
      return ctx.doc.create({
        ...defaultsFor("text"),
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: dragged ? base.h : rect.h,
        autoWidth: !dragged,
        parentId: frameIdAt(ctx, { x: rect.x + 1, y: rect.y + 1 }),
      });
    },
    after(ctx, id, undoDepth) {
      ctx.editing.start(id, { undoDepth });
    },
  });
}
