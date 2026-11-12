import { defaultsFor } from "../../model/defaults";
import type { ShapeKind } from "../../model/types";
import type { Tool } from "../tool-machine";
import { centreOf, centredRect, frameIdAt } from "./common";
import { dragCreateTool } from "./drag-create";

export type ShapeTool = Tool & {
  /** Kind of the next shape; the last one used stays selected. */
  kind: ShapeKind;
};

/** Click: a 160 x 120 shape centred on the pointer; drag: a shape of that size (Shift = square). */
export function createShapeTool(): ShapeTool {
  const state = { kind: "rect" as ShapeKind };
  const tool = dragCreateTool({
    id: "shape",
    cursor: "crosshair",
    clickRect: (_ctx, e) => centredRect(e.point, 160, 120),
    ratio: () => 1,
    create(ctx, rect) {
      return ctx.doc.create({
        ...defaultsFor("shape"),
        ...rect,
        kind: state.kind,
        parentId: frameIdAt(ctx, centreOf(rect)),
      });
    },
  });
  return Object.defineProperties(tool, {
    kind: { get: () => state.kind, set: (v: ShapeKind) => (state.kind = v), enumerable: true },
  }) as ShapeTool;
}
