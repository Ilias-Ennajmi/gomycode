import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { COMPACT_AGE_MS, COMPACT_ROWS, compact, maybeCompact, shouldCompact } from "@/lib/server/compaction";
import { appendUpdate, readUpdates, supabaseUpdatesDb, type UpdatesDb } from "@/lib/server/updates";
import { createFakePg, type FakePg } from "./helpers/fake-pg";

const OWNER = "11111111-1111-4111-8111-111111111111";
const BOARD = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HOUR = 3_600_000;

let pg: FakePg;
let db: UpdatesDb;
beforeEach(() => {
  pg = createFakePg();
  pg.tables.boards.push({ id: BOARD, owner_id: OWNER });
  db = supabaseUpdatesDb(pg.client({ sub: OWNER }) as never);
});

/** n incremental Yjs updates of one document, plus the document. */
function edits(n: number, from = 0, doc = new Y.Doc()) {
  const updates: Uint8Array[] = [];
  doc.on("update", (u: Uint8Array) => updates.push(u));
  for (let i = from; i < from + n; i++) doc.getMap("objects").set(`k${i}`, { n: i });
  return { doc, updates };
}
async function pushAll(updates: Uint8Array[]) {
  for (const u of updates) await appendUpdate(db, BOARD, u, "dev");
}
const later = (ms: number) => new Date(Date.now() + ms);
function replay(snapshot: Uint8Array | null, updates: Uint8Array[]): Y.Doc {
  const d = new Y.Doc();
  if (snapshot) Y.applyUpdate(d, snapshot);
  for (const u of updates) Y.applyUpdate(d, u);
  return d;
}
const same = (a: Y.Doc, b: Y.Doc) => {
  expect(a.getMap("objects").toJSON()).toEqual(b.getMap("objects").toJSON());
  expect(Y.encodeStateAsUpdate(a)).toEqual(Y.encodeStateAsUpdate(b));
};

describe("shouldCompact", () => {
  const now = new Date("2025-06-01T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  it("compacts above 200 rows", () => {
    expect(shouldCompact({ rowCount: COMPACT_ROWS + 1, referenceAt: ago(1000), now })).toBe(true);
    expect(shouldCompact({ rowCount: COMPACT_ROWS, referenceAt: ago(1000), now })).toBe(false);
  });
  it("compacts when the newest snapshot (or, with none, the oldest row) is over 24 hours old and there is something to merge", () => {
    expect(shouldCompact({ rowCount: 3, referenceAt: ago(COMPACT_AGE_MS + 1), now })).toBe(true);
    expect(shouldCompact({ rowCount: 3, referenceAt: ago(COMPACT_AGE_MS - 1000), now })).toBe(false);
    expect(shouldCompact({ rowCount: 0, referenceAt: ago(10 * COMPACT_AGE_MS), now })).toBe(false);
    expect(shouldCompact({ rowCount: 3, referenceAt: null, now })).toBe(false);
  });
});

describe("compact", () => {
  it("merges the rows into one snapshot and deletes them, leaving identical state", async () => {
    const { doc, updates } = edits(50);
    await pushAll(updates);

    const res = await compact(db, BOARD, { now: later(HOUR) });
    expect(res).toMatchObject({ compacted: true, uptoSeq: 50, merged: 50 });

    expect(pg.tables.board_updates).toHaveLength(0);
    expect(pg.tables.board_snapshots).toHaveLength(1);
    expect(pg.tables.board_snapshots[0]).toMatchObject({ board_id: BOARD, kind: "compaction", upto_seq: 50 });
    const snap = await db.latestSnapshot(BOARD);
    same(replay(snap!.state, []), doc);
  });

  it("builds on the previous snapshot and keeps a single compaction per day", async () => {
    const first = edits(10);
    await pushAll(first.updates);
    await compact(db, BOARD, { now: later(HOUR) });
    const second = edits(10, 10, first.doc);
    await pushAll(second.updates);
    const res = await compact(db, BOARD, { now: later(2 * HOUR) });

    expect(res).toMatchObject({ compacted: true, uptoSeq: 20, merged: 10 });
    expect(pg.tables.board_snapshots).toHaveLength(1);
    same(replay((await db.latestSnapshot(BOARD))!.state, []), first.doc);
  });

  it("leaves rows younger than the safety window alone (a slow transaction could still commit a lower seq)", async () => {
    await pushAll(edits(5).updates);
    expect(await compact(db, BOARD)).toEqual({ compacted: false });
    expect(pg.tables.board_updates).toHaveLength(5);
    expect(pg.tables.board_snapshots).toHaveLength(0);
  });

  it("does nothing for a board with no rows", async () => {
    expect(await compact(db, BOARD, { now: later(HOUR) })).toEqual({ compacted: false });
  });

  it("keeps rounds forever and drops compaction versions older than 30 days", async () => {
    const old = new Date(Date.now() - 40 * 24 * HOUR).toISOString();
    pg.tables.board_snapshots.push(
      { id: "old-compaction", board_id: BOARD, state: "\\x0000", upto_seq: 0, kind: "compaction", created_at: old },
      { id: "old-round", board_id: BOARD, state: "\\x0000", upto_seq: 0, kind: "round", label: "Round 1", created_at: old },
    );
    await pushAll(edits(3).updates);
    await compact(db, BOARD, { now: later(HOUR) });
    const ids = pg.tables.board_snapshots.map((s) => s.id);
    expect(ids).not.toContain("old-compaction");
    expect(ids).toContain("old-round");
    expect(pg.tables.board_snapshots).toHaveLength(2);
  });

  it("skips a damaged row instead of failing, and still clears it", async () => {
    const { doc, updates } = edits(4);
    await pushAll(updates.slice(0, 2));
    await appendUpdate(db, BOARD, new Uint8Array([255, 255, 255, 255, 255, 255, 255]), "dev");
    await pushAll(updates.slice(2));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await compact(db, BOARD, { now: later(HOUR) });
    expect(res).toMatchObject({ compacted: true, skipped: 1 });
    same(replay((await db.latestSnapshot(BOARD))!.state, []), doc);
    warn.mockRestore();
  });
});

describe("maybeCompact", () => {
  it("compacts once there are more than 200 rows", async () => {
    await pushAll(edits(COMPACT_ROWS).updates);
    expect(await maybeCompact(db, BOARD, { now: later(HOUR) })).toEqual({ compacted: false });
    await pushAll(edits(1, 1000).updates);
    expect(await maybeCompact(db, BOARD, { now: later(HOUR) })).toMatchObject({ compacted: true });
  });

  it("compacts a few old rows when the newest snapshot is more than a day old", async () => {
    await pushAll(edits(3).updates);
    expect(await maybeCompact(db, BOARD, { now: later(HOUR) })).toEqual({ compacted: false });
    expect(await maybeCompact(db, BOARD, { now: later(COMPACT_AGE_MS + HOUR) })).toMatchObject({ compacted: true, merged: 3 });
  });
});

describe("reading after compaction", () => {
  it("gives a snapshot to a reader that is behind it, and only later rows to one that is not", async () => {
    const { doc, updates } = edits(12);
    await pushAll(updates.slice(0, 8));
    await compact(db, BOARD, { now: later(HOUR) }); // snapshot upto 8
    await pushAll(updates.slice(8));

    const behind = await readUpdates(db, BOARD, 3);
    expect(behind.snapshot).toMatchObject({ uptoSeq: 8 });
    expect(behind.updates.map((u) => u.seq)).toEqual([9, 10, 11, 12]);
    same(replay(behind.snapshot!.state, behind.updates.map((u) => u.update)), doc);

    const current = await readUpdates(db, BOARD, 8);
    expect(current.snapshot).toBeUndefined();
    expect(current.updates.map((u) => u.seq)).toEqual([9, 10, 11, 12]);

    const fresh = await readUpdates(db, BOARD, 0);
    expect(fresh.snapshot?.uptoSeq).toBe(8);
  });

  it("pages long reads", async () => {
    await pushAll(edits(5).updates);
    const page = await readUpdates(db, BOARD, 0, 2);
    expect(page.updates.map((u) => u.seq)).toEqual([1, 2]);
    expect(page.more).toBe(true);
    const rest = await readUpdates(db, BOARD, 2, 10);
    expect(rest.more).toBe(false);
  });
});
