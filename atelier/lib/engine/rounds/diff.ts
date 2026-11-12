// What changed between two states of a board, for the round history and the compare page. Pure: no DOM, no Yjs, no clock.
// Deterministic: ids are listed in code-unit order and objects are compared by a key-sorted JSON form, so the same two boards
// always give the same diff whichever order their objects were read in.
import type { CanvasObject } from "@/lib/engine/model/types";
import type { RoundDiff } from "@/lib/share/round-types";

export type { RoundDiff } from "@/lib/share/round-types";

/** Longest id list stored per kind (added, removed, changed). The per-frame counts stay exact beyond it. */
export const MAX_DIFF_IDS = 2000;
/** Frames deeper than this are treated as not having a frame ancestor (malformed nesting). */
const MAX_DEPTH = 64;
export const NO_FRAME = "_none";

/** A short fingerprint of each text-bearing object's rich text (the Yjs content is not part of a validated object). */
export interface TextFingerprints {
  prev: ReadonlyMap<string, string> | null;
  next: ReadonlyMap<string, string>;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** JSON with sorted keys, leaving out what a move through z-order or a save timestamp changes without changing the picture. */
function fingerprint(o: CanvasObject): string {
  const rec = o as unknown as Record<string, unknown>;
  const skip = new Set(["updatedAt", "index"]);
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as object).sort()) out[k] = walk((v as Record<string, unknown>)[k]);
      return out;
    }
    return v;
  };
  const top: Record<string, unknown> = {};
  for (const k of Object.keys(rec).sort()) if (!skip.has(k)) top[k] = walk(rec[k]);
  return JSON.stringify(top);
}

/** The top-most frame the object is in (a frame counts as in itself), else "_none". Cycle and depth safe. */
function frameOf(id: string, objects: ReadonlyMap<string, CanvasObject>): string {
  let top: string | null = null;
  let cur: string | null = id;
  const seen = new Set<string>();
  for (let depth = 0; cur !== null && depth < MAX_DEPTH && !seen.has(cur); depth++) {
    seen.add(cur);
    const o = objects.get(cur);
    if (!o) break;
    if (o.type === "frame") top = o.id;
    cur = o.parentId;
  }
  return top ?? NO_FRAME;
}

/**
 * Added, removed and changed objects between two states (`prev` null = there was no previous round: everything is added).
 * `changed` means the validated object differs ignoring `updatedAt` and `index`, or its text fingerprint differs.
 */
export function diffObjects(prev: ReadonlyMap<string, CanvasObject> | null, next: ReadonlyMap<string, CanvasObject>, texts?: TextFingerprints): RoundDiff {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  const byFrame: RoundDiff["byFrame"] = {};
  const count = (frame: string, kind: "added" | "changed" | "removed") => {
    (byFrame[frame] ??= { added: 0, changed: 0, removed: 0 })[kind]++;
  };

  for (const [id, o] of next) {
    const before = prev?.get(id);
    if (!before) {
      added.push(id);
      count(frameOf(id, next), "added");
      continue;
    }
    const textChanged = texts ? (texts.prev?.get(id) ?? "") !== (texts.next.get(id) ?? "") : false;
    if (textChanged || fingerprint(before) !== fingerprint(o)) {
      changed.push(id);
      count(frameOf(id, next), "changed");
    }
  }
  if (prev) {
    for (const id of prev.keys()) {
      if (next.has(id)) continue;
      removed.push(id);
      count(frameOf(id, prev), "removed");
    }
  }

  added.sort(cmp);
  removed.sort(cmp);
  changed.sort(cmp);
  const truncated = added.length > MAX_DIFF_IDS || removed.length > MAX_DIFF_IDS || changed.length > MAX_DIFF_IDS;
  // Frame keys in a fixed order too, so the stored JSON is identical for identical boards.
  const sorted: RoundDiff["byFrame"] = {};
  for (const k of Object.keys(byFrame).sort(cmp)) sorted[k] = byFrame[k];
  return {
    added: added.slice(0, MAX_DIFF_IDS),
    removed: removed.slice(0, MAX_DIFF_IDS),
    changed: changed.slice(0, MAX_DIFF_IDS),
    byFrame: sorted,
    truncated,
  };
}

/** Exact totals (from the per-frame counts, which are never truncated). */
export function summariseDiff(d: RoundDiff): { added: number; changed: number; removed: number; total: number } {
  let added = 0;
  let changed = 0;
  let removed = 0;
  for (const c of Object.values(d.byFrame)) {
    added += c.added;
    changed += c.changed;
    removed += c.removed;
  }
  return { added, changed, removed, total: added + changed + removed };
}
