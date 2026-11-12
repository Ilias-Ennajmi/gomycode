import { defaultsFor } from "../model/defaults";
import { oneStepOn } from "../model/one-step";
import type { Command, CommandCtx } from "./registry";

/** Canvas point at the middle of the visible view. */
export function viewCentre(ctx: CommandCtx): { x: number; y: number } {
  const cam = ctx.canvas.getCamera();
  const vp = ctx.canvas.viewport();
  return { x: cam.x + vp.w / 2 / cam.z, y: cam.y + vp.h / 2 / cam.z };
}

/** A type specimen card (Inter, 40 px) in the middle of the view, selected, as one undo step. */
function insertTypeSpecimen(ctx: CommandCtx): void {
  const d = defaultsFor("typeSpecimen");
  const at = viewCentre(ctx);
  let id = "";
  oneStepOn(ctx.doc, () => {
    id = ctx.doc.create({ ...d, x: at.x - d.w / 2, y: at.y - d.h / 2 });
  });
  ctx.selection.set([id]);
}

/**
 * Commands for type specimens and video / GIF objects. They are listed in the "insert" group, which the More menu and the
 * command palette show.
 */
export const MEDIA_COMMANDS: Command[] = [{ id: "insert.typeSpecimen", label: "Type specimen", group: "insert", run: insertTypeSpecimen }];
