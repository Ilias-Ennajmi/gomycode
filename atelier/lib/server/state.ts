import * as Y from "yjs";
import type { UpdatesDb } from "./updates";

/*
 * Reading a board's current state on the server: the newest compaction snapshot plus every update row after it, applied to
 * one document and re-encoded. Rounds and the restore safety snapshot are built from this, never from anything the browser
 * sends, so a publish cannot be used to write arbitrary state into a board's history.
 */

/** What loadBoardState needs from the database (the real one is supabaseUpdatesDb; tests use it over an in-memory client). */
export type StateDb = Pick<UpdatesDb, "latestSnapshot" | "updatesAfter">;

/** A merged state larger than this is refused (a snapshot that size could not be served back within a Vercel response anyway). */
export const MAX_STATE_BYTES = 32 * 1024 * 1024;
const BATCH = 500;
const MAX_BATCHES = 400; // 200,000 rows: a board that needs more is compacted long before

export class StateTooLargeError extends Error {
  constructor(public readonly bytes: number) {
    super(`Board state is ${bytes} bytes; the limit is ${MAX_STATE_BYTES}`);
    this.name = "StateTooLargeError";
  }
}

/**
 * The board's merged state and the highest update seq it includes (the snapshot's own seq when no row is newer, 0 for a board
 * with no data). A row that is not a valid Yjs update is skipped, exactly as compaction skips it.
 */
export async function loadBoardState(boardId: string, db: StateDb, opts: { maxBytes?: number } = {}): Promise<{ state: Uint8Array; uptoSeq: number }> {
  const doc = new Y.Doc();
  try {
    const snapshot = await db.latestSnapshot(boardId);
    let after = 0;
    if (snapshot) {
      Y.applyUpdate(doc, snapshot.state);
      after = snapshot.uptoSeq;
    }
    for (let i = 0; i < MAX_BATCHES; i++) {
      const rows = await db.updatesAfter(boardId, after, BATCH);
      for (const r of rows) {
        try {
          Y.applyUpdate(doc, r.update);
        } catch {
          console.warn(`state: skipped an invalid update (board ${boardId}, seq ${r.seq})`);
        }
        after = r.seq;
      }
      if (rows.length < BATCH) break;
    }
    const state = Y.encodeStateAsUpdate(doc);
    const max = opts.maxBytes ?? MAX_STATE_BYTES;
    if (state.byteLength > max) throw new StateTooLargeError(state.byteLength);
    return { state, uptoSeq: after };
  } finally {
    doc.destroy();
  }
}

export { decodeBoardState, objectsFromState } from "@/lib/engine/rounds/decode";
