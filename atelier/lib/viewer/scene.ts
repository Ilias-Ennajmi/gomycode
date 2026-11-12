// Plain helpers over a ViewerBoard's object list: nesting, one slide's objects, culling, hit tests. Pure (no DOM, no Yjs).
import { hitTest } from "@/lib/engine/geometry/hit";
import { boundsOf, intersects } from "@/lib/engine/geometry/rect";
import type { Point, Rect } from "@/lib/engine/model/types";
import type { ViewerBoard, ViewerObject, ViewerSlide } from "./viewer-types";

export interface TreeNode {
  obj: ViewerObject;
  children: TreeNode[];
}

/** Objects arrive in paint order (parents before children); this nests them. An object whose parent is missing becomes a root. */
export function buildTree(objects: readonly ViewerObject[]): TreeNode[] {
  const nodes = new Map<string, TreeNode>();
  for (const obj of objects) nodes.set(obj.id, { obj, children: [] });
  const roots: TreeNode[] = [];
  for (const obj of objects) {
    const node = nodes.get(obj.id)!;
    const parent = obj.parentId === null ? undefined : nodes.get(obj.parentId);
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** The frame and everything inside it, in paint order. */
export function objectsOfSlide(objects: readonly ViewerObject[], frameId: string): ViewerObject[] {
  const inside = new Set<string>([frameId]);
  const out: ViewerObject[] = [];
  for (const o of objects) {
    if (o.id === frameId || (o.parentId !== null && inside.has(o.parentId))) {
      inside.add(o.id);
      out.push(o);
    }
  }
  return out;
}

/** The nearest frame around an object (itself when it is one); null for a free object or an unknown id. */
export function frameIdOf(objects: readonly ViewerObject[], id: string): string | null {
  const byId = new Map(objects.map((o) => [o.id, o]));
  let cur = byId.get(id);
  for (let i = 0; cur && i < 64; i++) {
    if (cur.type === "frame") return cur.id;
    cur = cur.parentId === null ? undefined : byId.get(cur.parentId);
  }
  return null;
}

/** The topmost image whose box contains the canvas point (objects in paint order: later is on top). */
export function imageAt(objects: readonly ViewerObject[], p: Point): ViewerObject | null {
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    if (o.type === "image" && hitTest(o, p, 0)) return o;
  }
  return null;
}

/** Roots (and their descendants) that overlap `view`. A parent that overlaps keeps its overlapping children only. */
export function cullTree(nodes: readonly TreeNode[], view: Rect, margin = 0): TreeNode[] {
  const v = { x: view.x - margin, y: view.y - margin, w: view.w + 2 * margin, h: view.h + 2 * margin };
  const out: TreeNode[] = [];
  for (const n of nodes) {
    // Arrows and strokes have no box of their own worth culling by: keep them (they are cheap).
    const keep = n.obj.type === "arrow" || intersects(boundsOf(n.obj), v);
    if (!keep) continue;
    out.push(n.children.length === 0 ? n : { obj: n.obj, children: cullTree(n.children, view, margin) });
  }
  return out;
}

export function slideOf(board: Pick<ViewerBoard, "slides">, id: string): ViewerSlide | null {
  return board.slides.find((s) => s.id === id) ?? null;
}
