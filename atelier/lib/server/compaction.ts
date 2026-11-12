import * as Y from "yjs";
import type { SnapshotDb, SnapshotMeta, UpdatesDb } from "./updates";

/** Compact when a board has more than this many update rows... */
export const COMPACT_ROWS = 200;
/** ...or when its newest snapshot is older than this. */
export const COMPACT_AGE_MS = 24 * 60 * 60 * 1000;
/**
 * Only rows older than this are merged. seq is assigned when a row is inserted, so a slow transaction could still
 * commit a lower seq than one already visible; waiting makes sure everything at or below the cut-off has landed.
 */
export const COMPACT_MIN_ROW_AGE_MS = 30_000;
/** Compaction versions are kept for 30 days (one per day); rounds are kept forever. */
export const HISTORY_DAYS = 30;
const MERGE_BATCH = 1000;

export function shouldCompact(p: { rowCount: number; referenceAt: string | null; now: Date }): boolean {
  if (p.rowCount > COMPACT_ROWS) return true;
  if (p.rowCount === 0 || !p.referenceAt) return false;
  const at = Date.parse(p.referenceAt);
  return Number.isFinite(at) && p.now.getTime() - at > COMPACT_AGE_MS;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const utcDay = (iso: string): string => iso.slice(0, 10);
const newerFirst = (a: SnapshotMeta, b: SnapshotMeta): number => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.uptoSeq - a.uptoSeq);

/**
 * Thins a board's version history. Kept: every round (forever); one compaction per UTC day, the newest, for 30 days; a named
 * compaction ("Before restore") for 30 days; the newest compaction that readers rebuild from (rows up to its seq are gone from
 * the server, so it must survive however old it is); and the board's newest snapshot of any kind. Everything else goes. Returns
 * how many were removed (one batch, no call when there is nothing to remove). Depends on `now`, never on the clock.
 */
export async function pruneSnapshots(boardId: string, now: Date, db: SnapshotDb): Promise<number> {
  const all = await db.listSnapshots(boardId);
  if (all.length === 0) return 0;
  const cutoff = new Date(now.getTime() - HISTORY_DAYS * DAY_MS).toISOString();

  const keep = new Set<string>();
  keep.add([...all].sort(newerFirst)[0].id); // the newest snapshot of any kind
  const bases = all.filter((s) => s.kind === "compaction" && s.label === null);
  if (bases.length > 0) keep.add(bases.reduce((best, s) => (s.uptoSeq > best.uptoSeq || (s.uptoSeq === best.uptoSeq && s.createdAt > best.createdAt) ? s : best)).id);

  const seenDays = new Set<string>();
  for (const s of [...all].sort(newerFirst)) {
    if (s.kind === "round") keep.add(s.id);
    else if (s.createdAt >= cutoff) {
      if (s.label !== null) keep.add(s.id);
      else if (!seenDays.has(utcDay(s.createdAt))) {
        seenDays.add(utcDay(s.createdAt));
        keep.add(s.id);
      }
    }
  }

  const doomed = all.filter((s) => !keep.has(s.id)).map((s) => s.id);
  if (doomed.length > 0) await db.deleteSnapshots(boardId, doomed);
  return doomed.length;
}

export type CompactResult = { compacted: false } | { compacted: true; uptoSeq: number; merged: number; skipped: number };

/**
 * Merge the board's update rows (and the previous snapshot) into one `compaction` snapshot, then delete the merged rows.
 * The snapshot is written first, so a crash in between leaves duplicates (harmless: Yjs ignores updates it has) and
 * never loses data. A row that is not a valid Yjs update is skipped and deleted with the rest.
 */
export async function compact(db: UpdatesDb, boardId: string, opts: { now?: Date; minRowAgeMs?: number } = {}): Promise<CompactResult> {
  const now = opts.now ?? new Date();
  const cutoff = now.getTime() - (opts.minRowAgeMs ?? COMPACT_MIN_ROW_AGE_MS);

  const rows = await db.updatesAfter(boardId, 0, MERGE_BATCH);
  const mergeable: typeof rows = [];
  for (const r of rows) {
    if (Date.parse(r.createdAt) >= cutoff) break; // contiguous prefix only
    mergeable.push(r);
  }
  if (mergeable.length === 0) return { compacted: false };

  const doc = new Y.Doc();
  const prev = await db.latestSnapshot(boardId);
  if (prev) Y.applyUpdate(doc, prev.state);
  let skipped = 0;
  for (const r of mergeable) {
    try {
      Y.applyUpdate(doc, r.update);
    } catch {
      skipped++;
      console.warn(`compaction: skipped an invalid update (board ${boardId}, seq ${r.seq})`);
    }
  }
  const uptoSeq = mergeable[mergeable.length - 1].seq;
  const state = Y.encodeStateAsUpdate(doc);
  doc.destroy();

  await db.insertSnapshot(boardId, state, uptoSeq, "compaction");
  await db.deleteUpdatesUpTo(boardId, uptoSeq);

  await pruneSnapshots(boardId, now, db);
  return { compacted: true, uptoSeq, merged: mergeable.length, skipped };
}

/** Compact if the rules say so. Cheap when they do not: a count, a snapshot lookup and one row. */
export async function maybeCompact(db: UpdatesDb, boardId: string, opts: { now?: Date; minRowAgeMs?: number } = {}): Promise<CompactResult> {
  const now = opts.now ?? new Date();
  const rowCount = await db.countUpdates(boardId);
  let referenceAt: string | null = null;
  if (rowCount > 0 && rowCount <= COMPACT_ROWS) {
    const snap = await db.latestSnapshot(boardId);
    referenceAt = snap?.createdAt ?? (await db.updatesAfter(boardId, 0, 1))[0]?.createdAt ?? null;
  }
  return shouldCompact({ rowCount, referenceAt, now }) ? compact(db, boardId, opts) : { compacted: false };
}
