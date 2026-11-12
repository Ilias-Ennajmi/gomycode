import type { BoardDoc } from "../doc/board-doc";
import { compareByIndex, keyBetween } from "../model/index-order";
import { oneStepOn } from "../model/one-step";
import type { CanvasObject } from "../model/types";

export type ZOp = "forward" | "backward" | "front" | "back";

function reordered(ids: string[], sel: Set<string>, op: ZOp): string[] {
  const arr = [...ids];
  if (op === "front") return [...arr.filter((i) => !sel.has(i)), ...arr.filter((i) => sel.has(i))];
  if (op === "back") return [...arr.filter((i) => sel.has(i)), ...arr.filter((i) => !sel.has(i))];
  if (op === "forward") {
    for (let i = arr.length - 2; i >= 0; i--) {
      if (sel.has(arr[i]) && !sel.has(arr[i + 1])) [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
    }
  } else {
    for (let i = 1; i < arr.length; i++) {
      if (sel.has(arr[i]) && !sel.has(arr[i - 1])) [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
    }
  }
  return arr;
}

/** A key between `a` and `b`; when they are equal (concurrent edits gave two siblings one key) go above `a`. */
export function safeKey(a: string | null, b: string | null): string {
  try {
    return keyBetween(a, b);
  } catch {
    return keyBetween(a, null);
  }
}

/** Smallest index among the siblings of `parent` that is above `after`, skipping `exclude`. */
export function nextSiblingIndex(doc: BoardDoc, parent: string | null, after: string, exclude: ReadonlySet<string>): string | null {
  let best: string | null = null;
  for (const o of doc.childrenOf(parent)) {
    if (exclude.has(o.id) || o.index <= after) continue;
    if (best === null || o.index < best) best = o.index;
  }
  return best;
}

/**
 * Move objects one step (forward / backward) or to the end (front / back) of their z-order among their siblings.
 * Several objects move as a block and keep their relative order. One undo step.
 */
export function reorderObjects(doc: BoardDoc, objs: CanvasObject[], op: ZOp): void {
  const byParent = new Map<string | null, Set<string>>();
  for (const o of objs) {
    const set = byParent.get(o.parentId) ?? new Set<string>();
    set.add(o.id);
    byParent.set(o.parentId, set);
  }
  const plan: { id: string; index: string }[] = [];
  for (const [parent, sel] of byParent) {
    const sibs = doc.childrenOf(parent);
    const before = sibs.map((o) => o.id);
    const after = reordered(before, sel, op);
    if (after.every((id, i) => id === before[i])) continue;
    const keyOf = new Map(sibs.map((o) => [o.id, o.index]));
    for (let i = 0; i < after.length; ) {
      if (!sel.has(after[i])) {
        i++;
        continue;
      }
      let j = i;
      while (j < after.length && sel.has(after[j])) j++;
      let prev = i > 0 ? keyOf.get(after[i - 1])! : null;
      const upper = j < after.length ? keyOf.get(after[j])! : null;
      for (let k = i; k < j; k++) {
        const index = safeKey(prev, upper);
        plan.push({ id: after[k], index });
        prev = index;
      }
      i = j;
    }
  }
  if (plan.length) oneStepOn(doc, () => plan.forEach((p) => doc.update(p.id, { index: p.index })));
}

export type DropTarget = { relativeTo: string; position: "above" | "below" } | { into: string };

function isInside(doc: BoardDoc, id: string, ancestor: string): boolean {
  let p: string | null = id;
  for (let d = 0; p && d < 32; d++) {
    if (p === ancestor) return true;
    p = doc.get(p)?.parentId ?? null;
  }
  return false;
}

/**
 * Drag-and-drop in the Layers panel: place objects above or below another layer, or inside a frame or group (as its
 * top child). Objects change parent when the target lives elsewhere; positions on the canvas stay the same. Children
 * of a moved frame or group travel with it. Returns false (and changes nothing) for an impossible drop, such as an
 * object into its own descendant. One undo step.
 */
export function dropObjects(doc: BoardDoc, ids: string[], to: DropTarget): boolean {
  const chosen = new Set(ids.filter((id) => doc.get(id)));
  // Only the outermost of the selection moves.
  const moving = doc
    .all()
    .filter((o) => chosen.has(o.id))
    .filter((o) => {
      let p = o.parentId;
      for (let d = 0; p && d < 32; d++) {
        if (chosen.has(p)) return false;
        p = doc.get(p)?.parentId ?? null;
      }
      return true;
    })
    .sort(compareByIndex);
  if (moving.length === 0) return false;
  const movingIds = new Set(moving.map((o) => o.id));

  const anchorId = "into" in to ? to.into : to.relativeTo;
  const anchor = doc.get(anchorId);
  if (!anchor) return false;
  if (moving.some((o) => isInside(doc, anchorId, o.id))) return false; // into itself or a descendant

  let parent: string | null;
  let lower: string | null;
  let upper: string | null;
  if ("into" in to) {
    if (anchor.type !== "frame" && anchor.type !== "group") return false;
    parent = anchor.id;
    const kids = doc.childrenOf(parent).filter((o) => !movingIds.has(o.id));
    lower = kids.length ? kids[kids.length - 1].index : null;
    upper = null;
  } else {
    parent = anchor.parentId;
    const sibs = doc.childrenOf(parent).filter((o) => !movingIds.has(o.id));
    const at = sibs.findIndex((o) => o.id === anchor.id);
    if (to.position === "above") {
      lower = anchor.index;
      upper = sibs[at + 1]?.index ?? null;
    } else {
      upper = anchor.index;
      lower = at > 0 ? sibs[at - 1].index : null;
    }
  }

  oneStepOn(doc, () => {
    let prev = lower;
    for (const o of moving) {
      const index = safeKey(prev, upper);
      doc.update(o.id, { parentId: parent, index });
      prev = index;
    }
  });
  return true;
}
