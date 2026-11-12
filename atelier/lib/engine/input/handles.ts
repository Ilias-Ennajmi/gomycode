import type { BoardDoc } from "../doc/board-doc";
import { boundsOf, unionRects } from "../geometry/rect";
import { rotateAround, type Handle } from "../geometry/transform";
import type { Point, Rect } from "../model/types";

/** The box drawn around the selection: one object's own (rotated) rect, or the union of several objects' bounds. */
export type SelectionBox = {
  /** Un-rotated rect; the box rotates about its centre. */
  rect: Rect;
  rotation: number;
  center: Point;
  single: boolean;
  /** False when there is nothing to resize or rotate (a lone arrow, or everything locked). */
  resizable: boolean;
  /** Id of the only selected object when `single`. */
  id?: string;
};

export function selectionBox(doc: BoardDoc, ids: ReadonlySet<string>): SelectionBox | null {
  const objs = [...ids].flatMap((id) => {
    const o = doc.get(id);
    return o ? [o] : [];
  });
  if (objs.length === 0) return null;
  const movable = objs.some((o) => !o.locked);
  if (objs.length === 1) {
    const o = objs[0];
    const asRect = o.type === "arrow" || o.type === "group";
    const rect = asRect ? boundsOf(o) : { x: o.x, y: o.y, w: o.w, h: o.h };
    const rotation = asRect ? 0 : o.rotation;
    return {
      rect,
      rotation,
      center: { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 },
      single: true,
      resizable: movable && o.type !== "arrow",
      id: o.id,
    };
  }
  const rect = unionRects(objs.map(boundsOf))!;
  return { rect, rotation: 0, center: { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }, single: false, resizable: movable };
}

/** Position of each handle on the box, as a fraction of its width and height. */
export const HANDLE_UNIT: Record<Handle, Point> = {
  nw: { x: 0, y: 0 },
  n: { x: 0.5, y: 0 },
  ne: { x: 1, y: 0 },
  e: { x: 1, y: 0.5 },
  se: { x: 1, y: 1 },
  s: { x: 0.5, y: 1 },
  sw: { x: 0, y: 1 },
  w: { x: 0, y: 0.5 },
};

export const HANDLES = Object.keys(HANDLE_UNIT) as Handle[];

/** Screen distance from the top edge to the rotate handle. */
export const ROTATE_OFFSET_PX = 28;
/** Half the side of a handle's hit area in screen px: 16 px square for mouse and pen, 44 px for touch. */
export const HANDLE_HIT_PX = { fine: 8, coarse: 22 };
/** Edge handles are dropped when the side they sit on is shorter than this on screen. */
const MIN_EDGE_SIDE_PX = 24;

function atUnit(box: SelectionBox, u: Point): Point {
  return rotateAround({ x: box.rect.x + u.x * box.rect.w, y: box.rect.y + u.y * box.rect.h }, box.center, box.rotation);
}

export function rotateHandlePoint(box: SelectionBox, zoom: number): Point {
  const z = zoom > 0 ? zoom : 1;
  const top = { x: box.center.x, y: box.rect.y - ROTATE_OFFSET_PX / z };
  return rotateAround(top, box.center, box.rotation);
}

/** Handles to show and hit-test at this zoom, with their canvas positions. */
export function visibleHandles(box: SelectionBox, zoom: number): Array<{ handle: Handle; point: Point }> {
  const z = zoom > 0 ? zoom : 1;
  const wide = box.rect.w * z >= MIN_EDGE_SIDE_PX;
  const tall = box.rect.h * z >= MIN_EDGE_SIDE_PX;
  return HANDLES.filter((h) => {
    if (h === "n" || h === "s") return wide;
    if (h === "e" || h === "w") return tall;
    return true;
  }).map((handle) => ({ handle, point: atUnit(box, HANDLE_UNIT[handle]) }));
}

export type HandleHit = { kind: "resize"; handle: Handle } | { kind: "rotate" };

/** Which handle (if any) is under canvas point `p`. */
export function hitHandle(box: SelectionBox, p: Point, zoom: number, pointerType: string): HandleHit | null {
  if (!box.resizable) return null;
  const z = zoom > 0 ? zoom : 1;
  const half = (pointerType === "touch" ? HANDLE_HIT_PX.coarse : HANDLE_HIT_PX.fine) / z;
  // Tested in the box's own rotated frame so each hit area is a square aligned with its handle.
  const local = rotateAround(p, box.center, -box.rotation);
  // Corners first: on a small box they must win over the edge handles that sit close to them.
  const byCorners = [...visibleHandles(box, z)].sort((a, b) => b.handle.length - a.handle.length);
  for (const h of byCorners) {
    const hp = rotateAround(h.point, box.center, -box.rotation);
    if (Math.abs(local.x - hp.x) <= half && Math.abs(local.y - hp.y) <= half) return { kind: "resize", handle: h.handle };
  }
  const rot = rotateHandlePoint(box, z);
  if (Math.hypot(p.x - rot.x, p.y - rot.y) <= half) return { kind: "rotate" };
  return null;
}

const CURSORS = ["ns-resize", "nesw-resize", "ew-resize", "nwse-resize"] as const;

/** Resize cursor for a handle on a box rotated by `rotation` radians (quantised to 45 degree steps). */
export function resizeCursor(handle: Handle, rotation: number): string {
  const base: Record<Handle, number> = { n: 0, ne: 1, e: 2, se: 3, s: 0, sw: 1, w: 2, nw: 3 };
  const steps = Math.round(((rotation * 180) / Math.PI) / 45);
  const i = (((base[handle] + steps) % 4) + 4) % 4;
  return CURSORS[i];
}
