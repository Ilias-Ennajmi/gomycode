import type { BoardDoc } from "../../doc/board-doc";
import { boundsOf, contains } from "../../geometry/rect";
import { defaultsFor, framePresetPx } from "../../model/defaults";
import { compareByIndex, keyBetween } from "../../model/index-order";
import type { FramePresetId, Rect } from "../../model/types";
import type { Tool, ToolCtx } from "../tool-machine";
import { centreOf, centredRect, frameIdAt } from "./common";
import { dragCreateTool } from "./drag-create";

export type FrameTool = Tool & {
  /** Preset of the next frame. A click creates the preset's size (scaled down to fit the view). */
  preset: FramePresetId;
};

/** Share of the viewport a frame created by a click may fill. */
const FIT = 0.8;

/** Preset size in canvas units, scaled down (never up) so that it fits the visible area. */
function fittedSize(ctx: ToolCtx, preset: FramePresetId): { w: number; h: number } {
  const { w, h } = framePresetPx(preset);
  const vp = ctx.viewport();
  const z = ctx.camera().z;
  if (!(vp.w > 0 && vp.h > 0 && z > 0)) return { w, h };
  const s = Math.min(1, (vp.w * FIT) / z / w, (vp.h * FIT) / z / h);
  return { w: w * s, h: h * s };
}

/**
 * Objects a new frame at `box` takes in: those fully inside it that sit on the canvas or in a frame that is not
 * itself inside the new one (children of a frame inside it travel with that frame). Group members go with their group.
 */
export function adoptableBy(doc: BoardDoc, box: Rect, exclude: string): string[] {
  const inside = (r: Rect) => contains(box, r);
  const out: string[] = [];
  for (const o of doc.all()) {
    if (o.id === exclude) continue;
    if (o.parentId) {
      const p = doc.get(o.parentId);
      if (!p || p.type === "group") continue;
      if (inside(boundsOf(p))) continue;
    }
    if (inside(boundsOf(o))) out.push(o.id);
  }
  return out;
}

export function createFrameTool(): FrameTool {
  const state = { preset: "slide-16-9" as FramePresetId };
  const tool = dragCreateTool({
    id: "frame",
    cursor: "crosshair",
    clickRect(ctx, e) {
      const { w, h } = fittedSize(ctx, state.preset);
      return centredRect(e.point, w, h);
    },
    ratio: () => {
      const { w, h } = framePresetPx(state.preset);
      return w / h;
    },
    create(ctx, rect, dragged, e) {
      const { doc } = ctx;
      const all = doc.all();
      const frames = all.filter((o) => o.type === "frame");
      const lastOrder = frames.map((f) => (f.type === "frame" ? f.order : "")).sort().pop() ?? null;
      const lowest = [...all].sort(compareByIndex)[0];
      let id = "";
      doc.transact(() => {
        // Frames sit behind the content they hold.
        id = doc.create({
          ...defaultsFor("frame"),
          ...rect,
          name: `Frame ${frames.length + 1}`,
          preset: dragged && !e.shiftKey ? "custom" : state.preset,
          order: keyBetween(lastOrder || null, null),
          index: keyBetween(null, lowest?.index ?? null),
          parentId: frameIdAt(ctx, centreOf(rect)),
        });
        for (const child of adoptableBy(doc, rect, id)) doc.update(child, { parentId: id });
      });
      return id;
    },
  });
  return Object.defineProperties(tool, {
    preset: { get: () => state.preset, set: (v: FramePresetId) => (state.preset = v), enumerable: true },
  }) as FrameTool;
}
