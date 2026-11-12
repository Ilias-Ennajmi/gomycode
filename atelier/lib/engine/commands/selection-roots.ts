import type { BoardDoc } from "../doc/board-doc";
import type { CanvasObject } from "../model/types";

/**
 * The selected objects that move and change as units: existing ones in z-order, minus objects whose ancestor is
 * selected too (a frame carries its children) and, unless `includeLocked`, minus locked objects.
 */
export function selectedRoots(doc: BoardDoc, ids: Iterable<string>, includeLocked = false): CanvasObject[] {
  const set = new Set(ids);
  const out: CanvasObject[] = [];
  for (const o of doc.all()) {
    if (!set.has(o.id) || (o.locked && !includeLocked)) continue;
    let p = o.parentId;
    let covered = false;
    for (let d = 0; p && d < 16; d++) {
      if (set.has(p)) {
        covered = true;
        break;
      }
      p = doc.get(p)?.parentId ?? null;
    }
    if (!covered) out.push(o);
  }
  return out;
}
