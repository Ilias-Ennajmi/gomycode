// Restoring an earlier version of a board without rewinding anything. The snapshot is loaded into a temporary document and the
// board is edited, in ONE transaction, until its objects match: an ordinary local edit (one undo step, synced like any other,
// merged with other devices' edits by Yjs). The history before it stays exactly as it was.
import * as Y from "yjs";
import { fragmentToBlocks } from "@/lib/engine/export/text-layout";
import type { BoardDoc } from "./board-doc";
import { docFromState } from "./from-state";

export interface RestoreCounts {
  added: number;
  removed: number;
  changed: number;
}

const sameValue = (a: unknown, b: unknown): boolean => a === b || (typeof a === "object" && typeof b === "object" && a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b));

const fingerprint = (frag: Y.XmlFragment): string => JSON.stringify(fragmentToBlocks(frag));

/** A deep copy of a fragment's children, ready to insert into another document. */
const cloneChildren = (frag: Y.XmlFragment): (Y.XmlElement | Y.XmlText)[] => frag.toArray().map((c) => c.clone() as Y.XmlElement | Y.XmlText);

type Plan = {
  remove: string[];
  /** Objects that exist now: the keys to set and delete, and whether the rich text is replaced. */
  update: { id: string; set: [string, unknown][]; drop: string[]; content: Y.XmlFragment | null }[];
  /** Objects the board does not have: every property, and their rich text. */
  create: { id: string; props: [string, unknown][]; content: Y.XmlFragment | null }[];
};

/**
 * Makes the board's objects equal the snapshot's. Invalid objects in the snapshot are skipped (and logged by the reader); objects
 * of the board that the snapshot does not have are removed, with anything else that is not a valid object. `meta` (the title,
 * settings) is left alone. Returns what changed; a board that already matches is not touched at all (no undo step).
 */
export function restoreSnapshotInto(doc: BoardDoc, state: Uint8Array): RestoreCounts {
  const snap = docFromState(state); // throws for bytes that are not a Yjs update, before anything is changed
  try {
    const objects = doc.ydoc.getMap<unknown>("objects");
    const wanted = new Map(snap.all().map((o) => [o.id, o]));
    const counts: RestoreCounts = { added: 0, removed: 0, changed: 0 };
    const plan: Plan = { remove: [], update: [], create: [] };

    for (const id of [...objects.keys()]) if (!wanted.has(id)) plan.remove.push(id);
    counts.removed = plan.remove.filter((id) => doc.get(id) !== undefined).length;

    for (const [id, target] of wanted) {
      const want = target as unknown as Record<string, unknown>;
      const snapContent = snap.content(id) ?? null;
      const current = objects.get(id);
      if (!(current instanceof Y.Map)) {
        plan.create.push({ id, props: Object.entries(want), content: snapContent });
        counts.added++;
        continue;
      }
      const set: [string, unknown][] = [];
      const drop: string[] = [];
      let differs = false;
      for (const [k, v] of Object.entries(want)) {
        if (sameValue(current.get(k), v)) continue;
        set.push([k, v]);
        if (k !== "updatedAt") differs = true;
      }
      for (const k of current.keys()) {
        if (k !== "content" && !(k in want)) {
          drop.push(k);
          differs = true;
        }
      }
      const now = current.get("content");
      const contentDiffers = snapContent !== null && (!(now instanceof Y.XmlFragment) || fingerprint(now) !== fingerprint(snapContent));
      if (contentDiffers) differs = true;
      if (!differs) continue;
      plan.update.push({ id, set, drop, content: contentDiffers ? snapContent : null });
      counts.changed++;
    }

    if (plan.remove.length === 0 && plan.update.length === 0 && plan.create.length === 0) return counts;

    doc.stopCapturing(); // its own undo step, even straight after another edit
    doc.transact(() => {
      for (const id of plan.remove) objects.delete(id);
      for (const u of plan.update) {
        const m = objects.get(u.id) as Y.Map<unknown>;
        for (const [k, v] of u.set) m.set(k, v);
        for (const k of u.drop) m.delete(k);
        if (u.content) {
          const now = m.get("content");
          if (now instanceof Y.XmlFragment) {
            // In place, so an open editor stays bound to the same fragment.
            if (now.length > 0) now.delete(0, now.length);
            now.insert(0, cloneChildren(u.content));
          } else {
            const fresh = new Y.XmlFragment();
            fresh.insert(0, cloneChildren(u.content));
            m.set("content", fresh);
          }
        }
      }
      for (const c of plan.create) {
        const m = new Y.Map<unknown>();
        for (const [k, v] of c.props) m.set(k, v);
        if (c.content) {
          const fresh = new Y.XmlFragment();
          fresh.insert(0, cloneChildren(c.content));
          m.set("content", fresh);
        }
        objects.set(c.id, m);
      }
    });
    doc.stopCapturing();
    return counts;
  } finally {
    snap.destroy();
  }
}

export interface RestoreCopyDeps {
  /** Makes a new, empty board (a record on the server and in the home list) and returns its id. */
  createBoard(title: string): Promise<string>;
  /** The new board's document, ready to be written to. */
  openDoc(id: string): Promise<BoardDoc>;
  /** Releases the document `openDoc` returned (default: nothing). */
  closeDoc?(id: string, doc: BoardDoc): Promise<void> | void;
  /** Removes a board that was created but could not be filled. */
  discardBoard?(id: string): Promise<void>;
}

/**
 * "Open as copy": a NEW board whose content is the snapshot, titled `title`. Nothing existing is touched. The bytes are checked
 * before any board is created; a failure after it removes the half-made board.
 */
export async function restoreAsCopy(state: Uint8Array, deps: RestoreCopyDeps, title: string): Promise<string> {
  docFromState(state).destroy(); // throws for bytes that are not a Yjs update
  const id = await deps.createBoard(title);
  let doc: BoardDoc | null = null;
  try {
    doc = await deps.openDoc(id);
    Y.applyUpdate(doc.ydoc, state);
    doc.meta.title = title;
    doc.stopCapturing();
  } catch (e) {
    await deps.discardBoard?.(id).catch(() => undefined);
    throw e;
  } finally {
    if (doc) await deps.closeDoc?.(id, doc);
  }
  return id;
}
