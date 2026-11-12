import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { firstFrameName, getTemplate } from "@/lib/engine/model/templates";

/*
 * Board documents are made on this device first (local-first): creating a board from a template
 * or duplicating one writes the Yjs document into the board's own IndexedDB database, and the
 * first sync after opening the board pushes it. The database name is the one the editor uses
 * (see lib/sync/local-store.ts): `atelier-board-{id}`.
 */

const dbName = (id: string) => `atelier-board-${id}`;

async function withPersistence<T>(id: string, fn: (ydoc: Y.Doc, p: IndexeddbPersistence) => Promise<T> | T): Promise<T> {
  const ydoc = new Y.Doc();
  const p = new IndexeddbPersistence(dbName(id), ydoc);
  await p.whenSynced;
  try {
    return await fn(ydoc, p);
  } finally {
    await p.destroy(); // closes the database after queued writes finish
    ydoc.destroy();
  }
}

/** Write a new board: its title and, unless blank or unknown, the template's objects. */
export async function createLocalBoardDoc(
  id: string,
  opts: { title: string; templateId?: string },
): Promise<{ firstFrameName: string | null }> {
  return withPersistence(id, (ydoc) => {
    const doc = new BoardDoc(ydoc);
    doc.meta.title = opts.title;
    getTemplate(opts.templateId)?.build(doc);
    const first = firstFrameName(doc);
    doc.destroy();
    return { firstFrameName: first };
  });
}

export type DuplicateResult = { ok: true; firstFrameName: string | null } | { ok: false; reason: "not-on-device" };

/**
 * The full state of a board's local document as one Yjs update, or null when this device has no
 * copy of it (the board was never opened here). Opening an unknown id would create an empty
 * database, so that is cleaned up.
 */
export async function readLocalBoardState(id: string): Promise<Uint8Array | null> {
  let update: Uint8Array | null = null;
  await withPersistence(id, (ydoc) => {
    if (ydoc.getMap("objects").size > 0 || ydoc.getMap("meta").size > 0) update = Y.encodeStateAsUpdate(ydoc);
  });
  if (!update) await deleteLocalBoardDoc(id);
  return update;
}

/** Write a copy of another board's state into a new board id, with its own title. */
export function writeLocalBoardCopy(newId: string, state: Uint8Array, title: string): Promise<{ firstFrameName: string | null }> {
  return withPersistence(newId, (ydoc) => {
    Y.applyUpdate(ydoc, state);
    const doc = new BoardDoc(ydoc);
    doc.meta.title = title;
    const first = firstFrameName(doc);
    doc.destroy();
    return { firstFrameName: first };
  });
}

/**
 * Copy a board's document into another board id by replaying its full state, so the copy opens
 * with everything the original had and the two evolve separately from then on. Needs the original
 * to have been opened on this device at least once; otherwise nothing is created.
 */
export async function duplicateLocalBoardDoc(sourceId: string, newId: string, title: string): Promise<DuplicateResult> {
  const state = await readLocalBoardState(sourceId);
  if (!state) return { ok: false, reason: "not-on-device" };
  return { ok: true, ...(await writeLocalBoardCopy(newId, state, title)) };
}

/** Forget a board's local document (used when the trash is emptied of an expired board). */
export function deleteLocalBoardDoc(id: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(dbName(id));
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}
