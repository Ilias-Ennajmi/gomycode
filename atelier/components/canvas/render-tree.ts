import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import type { CanvasObject } from "@/lib/engine/model/types";

export type RenderTree = {
  /** Objects drawn directly on the canvas layer, bottom-most first. */
  roots: string[];
  /** Frame id -> children drawn inside that frame, bottom-most first. */
  kids: Map<string, string[]>;
  /** id -> "parentId|index" of everything in the tree, to notice structural edits cheaply. */
  signature: Map<string, string>;
};

const MAX_DEPTH = 16;

type Entry = { id: string; frame: string | null; path: string[] };

/**
 * Where an object is drawn. Frames host their children; groups are invisible, so a group's children are drawn where
 * the group sits in the z-order of its siblings (path = indexes from the outermost group down to the object).
 */
function place(doc: BoardDoc, obj: CanvasObject): Entry {
  const path = [obj.index];
  let parentId = obj.parentId;
  for (let depth = 0; parentId && depth < MAX_DEPTH; depth++) {
    const parent = doc.get(parentId);
    if (!parent) return { id: obj.id, frame: null, path };
    if (parent.type === "frame") return { id: obj.id, frame: parent.id, path };
    if (parent.type === "group") path.unshift(parent.index);
    parentId = parent.parentId;
  }
  return { id: obj.id, frame: null, path };
}

function comparePath(a: Entry, b: Entry): number {
  const n = Math.min(a.path.length, b.path.length);
  for (let i = 0; i < n; i++) {
    if (a.path[i] !== b.path[i]) return a.path[i] < b.path[i] ? -1 : 1;
  }
  if (a.path.length !== b.path.length) return a.path.length < b.path.length ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Arrange the visible objects into the DOM hierarchy. Frames that host a visible object are pulled in too. */
export function buildRenderTree(doc: BoardDoc, ids: readonly string[]): RenderTree {
  const entries = new Map<string, Entry>();
  const queue = [...ids];
  while (queue.length) {
    const id = queue.pop()!;
    if (entries.has(id)) continue;
    const obj = doc.get(id);
    if (!obj || obj.type === "group") continue;
    const entry = place(doc, obj);
    entries.set(id, entry);
    if (entry.frame && !entries.has(entry.frame)) queue.push(entry.frame);
  }

  const buckets = new Map<string | null, Entry[]>();
  const signature = new Map<string, string>();
  for (const e of entries.values()) {
    const o = doc.get(e.id)!;
    signature.set(e.id, `${o.parentId ?? ""}|${o.index}`);
    const list = buckets.get(e.frame);
    if (list) list.push(e);
    else buckets.set(e.frame, [e]);
  }
  const sorted = (list: Entry[] | undefined) => (list ? list.sort(comparePath).map((e) => e.id) : []);
  const kids = new Map<string, string[]>();
  for (const [frame, list] of buckets) if (frame) kids.set(frame, sorted(list));
  return { roots: sorted(buckets.get(null)), kids, signature };
}
