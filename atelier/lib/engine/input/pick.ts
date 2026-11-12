import type { BoardDoc } from "../doc/board-doc";
import { hitTest } from "../geometry/hit";
import { rotateAround } from "../geometry/transform";
import type { FrameObj, CanvasObject, Point } from "../model/types";
import type { SpatialIndex } from "../spatial/spatial-index";
import type { Camera } from "../geometry/camera";

/** Slop around thin things (lines, outlines), in screen px. */
export const HIT_SLOP_PX = 4;
/** Frame name label: approximate screen size used for hit-testing it. */
const LABEL_H_PX = 20;
const LABEL_CHAR_PX = 6.5;
const LABEL_PAD_PX = 10;
const MAX_DEPTH = 16;

export type PickOptions = {
  /** Return the object itself even when it sits in a group (double-click enters a group). */
  enterGroups?: boolean;
  includeLocked?: boolean;
  /** Selected frames can be grabbed by their body; unselected ones only by label and border. */
  selected?: ReadonlySet<string>;
  /** Skip objects this returns false for (and carry on to the ones below them). */
  accept?: (o: CanvasObject) => boolean;
};

type Env = { doc: BoardDoc; index: Pick<SpatialIndex, "pointCandidates">; camera: () => Camera };

function frameLocal(f: FrameObj, p: Point): Point {
  return f.rotation === 0 ? p : rotateAround(p, { x: f.x + f.w / 2, y: f.y + f.h / 2 }, -f.rotation);
}

/** Frames are grabbed by label, border, or (when selected) body, so empty frame space stays free for a marquee. */
function hitFrame(f: FrameObj, p: Point, tol: number, zoom: number, selected: boolean): boolean {
  const q = frameLocal(f, p);
  const lx = q.x - f.x;
  const ly = q.y - f.y;
  const labelW = (Math.min(f.name.length, 40) * LABEL_CHAR_PX + LABEL_PAD_PX) / zoom;
  if (lx >= 0 && lx <= labelW && ly >= -LABEL_H_PX / zoom && ly <= 0) return true;
  const insideX = lx >= -tol && lx <= f.w + tol;
  const insideY = ly >= -tol && ly <= f.h + tol;
  if (!insideX || !insideY) return false;
  if (selected && lx >= 0 && lx <= f.w && ly >= 0 && ly <= f.h) return true;
  const edge = Math.min(Math.abs(lx), Math.abs(lx - f.w), Math.abs(ly), Math.abs(ly - f.h));
  return edge <= tol;
}

/** True when an ancestor frame clips `o` and `p` lies outside that frame, so `o` is invisible there. */
function clippedAway(doc: BoardDoc, o: CanvasObject, p: Point): boolean {
  let parentId = o.parentId;
  for (let depth = 0; parentId && depth < MAX_DEPTH; depth++) {
    const parent = doc.get(parentId);
    if (!parent) return false;
    if (parent.type === "frame" && parent.clip && !hitTest(parent, p, 0)) return true;
    parentId = parent.parentId;
  }
  return false;
}

/** Outermost group containing `o`, or `o` itself. */
export function topSelectable(doc: BoardDoc, o: CanvasObject): CanvasObject {
  let top = o;
  let parentId = o.parentId;
  for (let depth = 0; parentId && depth < MAX_DEPTH; depth++) {
    const parent = doc.get(parentId);
    if (!parent) break;
    if (parent.type === "group") top = parent;
    parentId = parent.parentId;
  }
  return top;
}

/** The top-most selectable object at canvas point `p`, or null. */
export function pickObject(env: Env, p: Point, opts: PickOptions = {}): CanvasObject | null {
  const zoom = env.camera().z;
  const tol = HIT_SLOP_PX / zoom;
  for (const id of env.index.pointCandidates(p, tol + LABEL_H_PX / zoom)) {
    const o = env.doc.get(id);
    if (!o || o.type === "group") continue;
    if (o.locked && !opts.includeLocked) continue;
    if (opts.accept && !opts.accept(o)) continue;
    const hit =
      o.type === "frame"
        ? hitFrame(o, p, tol, zoom, opts.selected?.has(o.id) ?? false)
        : hitTest(o, p, tol, { resolve: (rid) => env.doc.get(rid) });
    if (!hit || clippedAway(env.doc, o, p)) continue;
    return opts.enterGroups ? o : topSelectable(env.doc, o);
  }
  return null;
}
