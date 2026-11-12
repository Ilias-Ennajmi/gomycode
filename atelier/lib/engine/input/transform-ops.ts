import * as Y from "yjs";
import { newId } from "@/lib/ids";
import type { BoardDoc } from "../doc/board-doc";
import { arrowBounds, terminalPoint } from "../geometry/arrow-path";
import { boundsOf } from "../geometry/rect";
import { hitTest } from "../geometry/hit";
import { compareByIndex } from "../model/index-order";
import type { ArrowObj, CanvasObject, NewObject, Point, Rect, StrokeObj, Terminal } from "../model/types";
import type { SpatialIndex } from "../spatial/spatial-index";

export const MIN_SIZE = 1;

/** A set of objects being transformed together, with their state at the start of the gesture. */
export type Session = {
  /** The objects the user selected (unlocked only), minus any whose ancestor is also selected. */
  roots: string[];
  /** Everything that moves: roots plus the descendants that go with them. Snapshots, never mutated. */
  items: CanvasObject[];
  ids: Set<string>;
  /** Arrows bound to something that moves but which do not move themselves: only their bounds need refreshing. */
  followers: ArrowObj[];
};

function descendants(doc: BoardDoc, id: string, intoFrames: boolean, out: CanvasObject[], seen: Set<string>): void {
  for (const c of doc.childrenOf(id)) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
    if (c.type === "frame" && !intoFrames) continue;
    descendants(doc, c.id, intoFrames, out, seen);
  }
}

/**
 * Snapshot the objects a gesture will transform. Locked objects among `selected` are skipped; descendants of a
 * selected frame or group are included (`withFrameChildren`: a resize leaves a frame's children alone but still
 * scales the children of a group, which has no size of its own).
 */
export function beginSession(doc: BoardDoc, selected: Iterable<string>, withFrameChildren = true): Session {
  const sel = [...selected].flatMap((id) => {
    const o = doc.get(id);
    return o && !o.locked ? [o] : [];
  });
  const selIds = new Set(sel.map((o) => o.id));
  const hasSelectedAncestor = (o: CanvasObject) => {
    let p = o.parentId;
    for (let d = 0; p && d < 16; d++) {
      if (selIds.has(p)) return true;
      p = doc.get(p)?.parentId ?? null;
    }
    return false;
  };
  const roots = sel.filter((o) => !hasSelectedAncestor(o));
  const items: CanvasObject[] = [];
  const seen = new Set<string>();
  for (const r of roots) {
    seen.add(r.id);
    items.push(r);
    if (r.type !== "frame" || withFrameChildren) descendants(doc, r.id, withFrameChildren, items, seen);
  }
  const ids = new Set(items.map((o) => o.id));
  const followers: ArrowObj[] = [];
  for (const o of doc.all()) {
    if (o.type !== "arrow" || ids.has(o.id)) continue;
    const bound = (t: Terminal) => t.kind === "bound" && ids.has(t.id);
    if (bound(o.start) || bound(o.end)) followers.push(o);
  }
  return { roots: roots.map((o) => o.id), items, ids, followers };
}

/** Union of the AABBs of the session's roots at the start of the gesture. */
export function sessionBounds(s: Session): Rect | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const o of s.items) {
    if (!s.roots.includes(o.id)) continue;
    const b = boundsOf(o);
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  return Number.isFinite(x0 + y0 + x1 + y1) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/** How a gesture maps the plane. Applied to the snapshots in `Session`, so it is absolute, not incremental. */
export type Transform = {
  map(p: Point): Point;
  sx: number;
  sy: number;
  /** Added to every object's rotation (radians). */
  dRot: number;
};

function mapTerminal(t: Terminal, s: Session, tr: Transform, doc: BoardDoc): Terminal {
  if (t.kind === "point") {
    const p = tr.map({ x: t.x, y: t.y });
    return { kind: "point", x: p.x, y: p.y };
  }
  if (s.ids.has(t.id)) return t; // the target moves with the arrow: stay bound
  // Bound to something that stays: the arrow comes loose where it was attached, then travels with the gesture.
  const at = terminalPoint(t, (id) => doc.get(id));
  if (!at) return t;
  const p = tr.map(at);
  return { kind: "point", x: p.x, y: p.y };
}

function scaleStroke(o: StrokeObj, sx: number, sy: number): number[] | undefined {
  if (Math.abs(sx - 1) < 1e-12 && Math.abs(sy - 1) < 1e-12) return undefined;
  const pts = o.points.slice();
  for (let i = 0; i + 2 < pts.length; i += 3) {
    pts[i] *= sx;
    pts[i + 1] *= sy;
  }
  return pts;
}

/** Write the transformed state of every item. Call inside one `doc.transact`. */
export function applyTransform(doc: BoardDoc, s: Session, tr: Transform): void {
  // Boxes first, so arrows (which read their targets) see the new positions.
  for (const o of s.items) {
    if (o.type === "arrow" || o.type === "group") continue;
    const c = tr.map({ x: o.x + o.w / 2, y: o.y + o.h / 2 });
    const w = Math.max(o.w * tr.sx, MIN_SIZE);
    const h = Math.max(o.h * tr.sy, MIN_SIZE);
    const patch: Partial<CanvasObject> & Record<string, unknown> = {
      x: c.x - w / 2,
      y: c.y - h / 2,
      w,
      h,
      rotation: o.rotation + tr.dRot,
    };
    if (o.type === "stroke") {
      const pts = scaleStroke(o, w / o.w, h / o.h);
      if (pts) patch.points = pts;
    }
    if (o.type === "text" && Math.abs(w - o.w) > 1e-9) patch.autoWidth = false;
    doc.update(o.id, patch as Partial<CanvasObject>);
  }
  for (const o of s.items) {
    if (o.type !== "arrow") continue;
    const next: ArrowObj = { ...o, start: mapTerminal(o.start, s, tr, doc), end: mapTerminal(o.end, s, tr, doc) };
    doc.update(o.id, { start: next.start, end: next.end, ...arrowBounds(next, (id) => doc.get(id)) });
  }
  refreshFollowers(doc, s);
}

/** Re-fit the bounds of arrows that are bound to moved objects (so culling and hit-testing stay right). */
export function refreshFollowers(doc: BoardDoc, s: Session): void {
  for (const a of s.followers) {
    const cur = doc.get(a.id);
    if (cur?.type === "arrow") doc.update(a.id, arrowBounds(cur, (id) => doc.get(id)));
  }
}

export function translation(dx: number, dy: number): Transform {
  return { map: (p) => ({ x: p.x + dx, y: p.y + dy }), sx: 1, sy: 1, dRot: 0 };
}

/**
 * Copy the session's objects (roots and descendants) with new ids, keeping z-order, parents among the copies,
 * the roots' original parents, rich-text content, and arrow bindings (to the copy when the target was copied,
 * otherwise to the original target). Returns the new session over the copies and the old -> new id map.
 */
export function duplicateSession(doc: BoardDoc, s: Session): { session: Session; map: Map<string, string> } {
  const map = new Map<string, string>();
  for (const o of s.items) map.set(o.id, newId());
  const ordered = [...s.items].sort(compareByIndex);
  const remap = (t: Terminal): Terminal => (t.kind === "bound" && map.has(t.id) ? { ...t, id: map.get(t.id)! } : t);
  const specs = ordered.map((o) => {
    const { index: _i, createdAt: _c, updatedAt: _u, ...rest } = o;
    void _i;
    void _c;
    void _u;
    const spec = { ...rest, id: map.get(o.id)!, parentId: o.parentId && map.has(o.parentId) ? map.get(o.parentId)! : o.parentId } as Record<string, unknown>;
    if (o.type === "arrow") {
      spec.start = remap(o.start);
      spec.end = remap(o.end);
    }
    return spec as unknown as NewObject;
  });
  doc.transact(() => {
    doc.createMany(specs);
    for (const o of ordered) {
      const from = doc.content(o.id);
      const to = doc.content(map.get(o.id)!);
      if (from && to && from.length > 0) to.insert(0, from.toArray().flatMap((n) => (n instanceof Y.XmlHook ? [] : [n.clone()])));
    }
  });
  return { session: beginSession(doc, s.roots.map((id) => map.get(id)!)), map };
}

/** The smallest frame (not in `exclude`) containing canvas point `p`, or null. */
export function frameAt(doc: BoardDoc, index: Pick<SpatialIndex, "pointCandidates">, p: Point, exclude: ReadonlySet<string>): CanvasObject | null {
  let best: CanvasObject | null = null;
  for (const id of index.pointCandidates(p, 0)) {
    if (exclude.has(id)) continue;
    const f = doc.get(id);
    if (!f || f.type !== "frame" || !hitTest(f, p, 0)) continue;
    if (!best || f.w * f.h < best.w * best.h) best = f;
  }
  return best;
}

function centreOf(o: CanvasObject): Point {
  const b = boundsOf(o);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/** Frame an object would be dropped into (null = the canvas), judged by its centre. */
export function dropTarget(doc: BoardDoc, index: Pick<SpatialIndex, "pointCandidates">, o: CanvasObject, exclude: ReadonlySet<string>): string | null {
  return frameAt(doc, index, centreOf(o), exclude)?.id ?? null;
}

/** After a drop: parent each root under the frame it landed on (or the canvas). Objects inside groups stay put. */
export function reparentRoots(doc: BoardDoc, index: Pick<SpatialIndex, "pointCandidates">, s: Session): void {
  for (const id of s.roots) {
    const o = doc.get(id);
    if (!o) continue;
    if (o.parentId && doc.get(o.parentId)?.type === "group") continue;
    const target = dropTarget(doc, index, o, s.ids);
    if (target !== o.parentId) doc.update(id, { parentId: target });
  }
}
