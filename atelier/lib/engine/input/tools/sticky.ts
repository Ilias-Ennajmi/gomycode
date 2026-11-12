import { defaultsFor } from "../../model/defaults";
import type { StickyColor, StickySize } from "../../model/types";
import type { Tool } from "../tool-machine";
import { centreOf, centredRect, frameIdAt } from "./common";
import { dragCreateTool } from "./drag-create";

export type StickyTool = Tool & {
  /** Colour of the next sticky (the toolbar sets it). */
  fill: StickyColor;
  size: StickySize;
};

/** Click: a 200 x 200 sticky centred on the pointer; drag: a sticky of that size. Editing starts right away. */
export function createStickyTool(): StickyTool {
  const state = { fill: "yellow" as StickyColor, size: "M" as StickySize };
  const tool = dragCreateTool({
    id: "sticky",
    cursor: "crosshair",
    clickRect: (_ctx, e) => centredRect(e.point, 200, 200),
    ratio: () => 1,
    create(ctx, rect) {
      return ctx.doc.create({
        ...defaultsFor("sticky"),
        ...rect,
        fill: state.fill,
        size: state.size,
        parentId: frameIdAt(ctx, centreOf(rect)),
      });
    },
    after(ctx, id, undoDepth) {
      ctx.editing.start(id, { undoDepth });
    },
  });
  return Object.defineProperties(tool, {
    fill: { get: () => state.fill, set: (v: StickyColor) => (state.fill = v), enumerable: true },
    size: { get: () => state.size, set: (v: StickySize) => (state.size = v), enumerable: true },
  }) as StickyTool;
}
