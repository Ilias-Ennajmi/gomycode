import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { compact, HISTORY_DAYS, pruneSnapshots } from "@/lib/server/compaction";
import { appendUpdate, readUpdates, supabaseUpdatesDb, type SnapshotDb, type SnapshotMeta, type UpdatesDb } from "@/lib/server/updates";
import { createFakePg, type FakePg } from "./helpers/fake-pg";

const DAY = 24 * 3_600_000;
const NOW = new Date("2026-06-30T08:00:00Z");
const BOARD = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "11111111-1111-4111-8111-111111111111";

/** An in-memory SnapshotDb that records what it was asked to delete. */
function fakeDb(rows: SnapshotMeta[]) {
  const deleted: string[][] = [];
  const db: SnapshotDb = {
    async listSnapshots() {
      return rows.map((r) => ({ ...r }));
    },
    async deleteSnapshots(_board, ids) {
      deleted.push([...ids]);
      for (const id of ids) rows.splice(rows.findIndex((r) => r.id === id), 1);
    },
  };
  return { db, rows, deleted };
}
let n = 0;
// uptoSeq grows with time, as it does on a real board
const snap = (kind: SnapshotMeta["kind"], at: string, over: Partial<SnapshotMeta> = {}): SnapshotMeta => ({ id: `s${++n}`, kind, label: null, createdAt: at, uptoSeq: Math.floor(Date.parse(at) / 1000), ...over });
const daysAgo = (d: number, hour = 2) => new Date(Date.UTC(2026, 5, 30 - d, hour)).toISOString();
const ids = (rows: SnapshotMeta[], kind: SnapshotMeta["kind"]) => rows.filter((r) => r.kind === kind).map((r) => r.id);

describe("pruneSnapshots", () => {
  it("keeps the newest compaction per UTC day for 30 days, every round, and drops the rest", async () => {
    n = 0;
    const rows: SnapshotMeta[] = [];
    for (let h = 1; h <= 4; h++) rows.push(snap("compaction", daysAgo(0, h))); // four today
    for (let d = 1; d <= 89; d++) rows.push(snap("compaction", daysAgo(d)));
    const rounds = [snap("round", daysAgo(85)), snap("round", daysAgo(40)), snap("round", daysAgo(2))];
    rows.push(...rounds);
    const f = fakeDb(rows);
    const removed = await pruneSnapshots(BOARD, NOW, f.db);
    expect(removed).toBe(3 + 60); // three of today's four, and days 30..89
    const kept = ids(f.rows, "compaction");
    expect(kept).toHaveLength(30);
    expect(kept).toContain(rows.find((r) => r.createdAt === daysAgo(0, 4))!.id); // the newest of today
    expect(ids(f.rows, "round").sort()).toEqual(rounds.map((r) => r.id).sort()); // rounds are forever, whatever their age
    expect(f.deleted).toHaveLength(1); // one batch
    expect(f.deleted[0].some((id) => rounds.some((r) => r.id === id))).toBe(false);
  });

  it("with a board untouched for 90 days still keeps its newest snapshot (the one readers rebuild from)", async () => {
    n = 0;
    const older = snap("compaction", daysAgo(95));
    const newest = snap("compaction", daysAgo(90));
    const f = fakeDb([older, newest]);
    expect(await pruneSnapshots(BOARD, NOW, f.db)).toBe(1);
    expect(f.rows.map((r) => r.id)).toEqual([newest.id]);
  });

  it("never deletes the board's only snapshot, whatever it is", async () => {
    n = 0;
    for (const only of [snap("compaction", daysAgo(200), { label: "Before restore" }), snap("round", daysAgo(200)), snap("compaction", daysAgo(200))]) {
      const f = fakeDb([only]);
      expect(await pruneSnapshots(BOARD, NOW, f.db)).toBe(0);
      expect(f.rows).toHaveLength(1);
    }
  });

  it("a labelled safety snapshot survives the per-day rule for 30 days, then goes", async () => {
    n = 0;
    const base = snap("compaction", daysAgo(0, 5));
    const safety = snap("compaction", daysAgo(0, 3), { label: "Before restore" });
    const oldSafety = snap("compaction", daysAgo(31), { label: "Before restore" });
    const sameDayPlain = snap("compaction", daysAgo(0, 1));
    const f = fakeDb([base, safety, oldSafety, sameDayPlain]);
    expect(await pruneSnapshots(BOARD, NOW, f.db)).toBe(2);
    expect(f.rows.map((r) => r.id).sort()).toEqual([base.id, safety.id].sort());
  });

  it("keeps the newest compaction that can be read from even when a newer snapshot is a labelled one", async () => {
    n = 0;
    const base = snap("compaction", daysAgo(50)); // the read base: rows up to its seq are gone from the server
    const safety = snap("compaction", daysAgo(1), { label: "Before restore", uptoSeq: 5 });
    base.uptoSeq = 100; // the safety snapshot covers fewer seqs: only the base can be read from
    const f = fakeDb([base, safety]);
    await pruneSnapshots(BOARD, NOW, f.db);
    expect(f.rows.map((r) => r.id)).toContain(base.id);
  });

  it("a board with only rounds loses nothing; a second run removes nothing", async () => {
    n = 0;
    const f = fakeDb([snap("round", daysAgo(100)), snap("round", daysAgo(3))]);
    expect(await pruneSnapshots(BOARD, NOW, f.db)).toBe(0);
    const g = fakeDb([snap("compaction", daysAgo(1, 1)), snap("compaction", daysAgo(1, 2))]);
    expect(await pruneSnapshots(BOARD, NOW, g.db)).toBe(1);
    expect(await pruneSnapshots(BOARD, NOW, g.db)).toBe(0);
    expect(g.deleted).toHaveLength(1); // nothing to delete means no call
  });

  it("does not depend on the time of day: a snapshot exactly 30 days old goes, one a minute younger stays", async () => {
    n = 0;
    const edge = snap("compaction", new Date(NOW.getTime() - HISTORY_DAYS * DAY).toISOString());
    const inside = snap("compaction", new Date(NOW.getTime() - HISTORY_DAYS * DAY + 60_000).toISOString());
    const newest = snap("compaction", daysAgo(0, 1));
    const f = fakeDb([edge, inside, newest]);
    await pruneSnapshots(BOARD, NOW, f.db);
    expect(f.rows.map((r) => r.id).sort()).toEqual([inside.id, newest.id].sort());
  });
});

describe("pruning through the real database layer", () => {
  let pg: FakePg;
  let db: UpdatesDb;
  beforeEach(() => {
    pg = createFakePg();
    pg.tables.boards.push({ id: BOARD, owner_id: OWNER });
    db = supabaseUpdatesDb(pg.client({ sub: OWNER }) as never);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-01T08:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  const edits = (count: number, doc = new Y.Doc(), from = 0) => {
    const updates: Uint8Array[] = [];
    doc.on("update", (u: Uint8Array) => updates.push(u));
    for (let i = from; i < from + count; i++) doc.getMap("objects").set(`k${i}`, { n: i });
    return { doc, updates };
  };

  it("listSnapshots and deleteSnapshots work, and deleteSnapshots never touches a round", async () => {
    pg.tables.board_snapshots.push(
      { id: "c1", board_id: BOARD, state: "\\x00", upto_seq: 1, kind: "compaction", label: null, created_at: "2026-05-01T00:00:00Z" },
      { id: "r1", board_id: BOARD, state: "\\x00", upto_seq: 1, kind: "round", label: "Round 1", created_at: "2026-05-01T00:00:00Z" },
    );
    expect((await db.listSnapshots(BOARD)).map((s) => [s.id, s.kind, s.label]).sort()).toEqual([["c1", "compaction", null], ["r1", "round", "Round 1"]]);
    await db.deleteSnapshots(BOARD, ["c1", "r1"]);
    expect(pg.tables.board_snapshots.map((s) => s.id)).toEqual(["r1"]);
  });

  it("compact() prunes after merging, and a reader behind the snapshot still catches up", async () => {
    const first = edits(10);
    for (const u of first.updates) await appendUpdate(db, BOARD, u, "dev");
    await compact(db, BOARD, { now: new Date(Date.now() + 3_600_000) });
    pg.tables.board_snapshots.push({ id: "ancient", board_id: BOARD, state: "\\x00", upto_seq: 0, kind: "compaction", label: null, created_at: "2026-01-01T00:00:00Z" });
    const second = edits(5, first.doc, 10);
    for (const u of second.updates) await appendUpdate(db, BOARD, u, "dev");
    await compact(db, BOARD, { now: new Date(Date.now() + 7_200_000) });
    expect(pg.tables.board_snapshots.map((s) => s.id)).not.toContain("ancient");
    expect(pg.tables.board_snapshots).toHaveLength(1);
    const read = await readUpdates(db, BOARD, 0);
    const d = new Y.Doc();
    if (read.snapshot) Y.applyUpdate(d, read.snapshot.state);
    for (const u of read.updates) Y.applyUpdate(d, u.update);
    expect([...d.getMap("objects").keys()]).toHaveLength(15);
  });

  it("a round snapshot is never the base a reader is given (its rows were not removed)", async () => {
    const e = edits(3);
    for (const u of e.updates) await appendUpdate(db, BOARD, u, "dev");
    pg.tables.board_snapshots.push({ id: "r1", board_id: BOARD, state: "\\x00", upto_seq: 3, kind: "round", label: "Round 1", created_at: new Date().toISOString() });
    expect(await db.latestSnapshot(BOARD)).toBeNull();
    const read = await readUpdates(db, BOARD, 0);
    expect(read.snapshot).toBeUndefined();
    expect(read.updates).toHaveLength(3);
  });

  it("a labelled safety snapshot is not a read base either", async () => {
    pg.tables.board_snapshots.push({ id: "safety", board_id: BOARD, state: "\\x00", upto_seq: 3, kind: "compaction", label: "Before restore", created_at: new Date().toISOString() });
    expect(await db.latestSnapshot(BOARD)).toBeNull();
  });
});
