import * as Y from "yjs";
import { beforeEach, describe, expect, it } from "vitest";
import { RoundNumberTakenError, type NewRound } from "@/lib/server/share-store";
import { EMPTY_ROUND_DIFF } from "@/lib/share/round-types";
import { memoryHarness, supabaseHarness, type ShareHarness } from "./helpers/share-harness";

const OWNER = "11111111-1111-4111-8111-111111111111";
const BOARD = "55555555-5555-4555-8555-555555555555";
const BOARD2 = "66666666-6666-4666-8666-666666666666";

/** One Yjs update that sets `key` in the objects map. */
function update(key: string, from?: Y.Doc): { update: Uint8Array; doc: Y.Doc } {
  const doc = from ?? new Y.Doc();
  let captured: Uint8Array = new Uint8Array();
  const on = (u: Uint8Array) => (captured = u);
  doc.on("update", on);
  doc.getMap("objects").set(key, key);
  doc.off("update", on);
  return { update: captured, doc };
}
const keys = (state: Uint8Array) => {
  const d = new Y.Doc();
  Y.applyUpdate(d, state);
  return [...d.getMap("objects").keys()].sort();
};
const newRound = (over: Partial<NewRound> = {}): NewRound => ({ boardId: BOARD, number: 1, label: "Round 1", snapshotId: "", previews: {}, diff: EMPTY_ROUND_DIFF, ...over });

describe.each([["memory", memoryHarness], ["supabase over the PostgREST stand-in", supabaseHarness]] as const)("ShareStore rounds and snapshots: %s", (_n, make) => {
  let h: ShareHarness;
  beforeEach(() => {
    h = make();
    h.seedBoard({ id: BOARD, ownerId: OWNER });
    h.seedBoard({ id: BOARD2, ownerId: OWNER });
  });

  describe("snapshotBoard", () => {
    it("stores the merged live state as a snapshot and returns it with the seq it covers", async () => {
      const a = update("a");
      h.seedLive(BOARD, a.update);
      h.seedLive(BOARD, update("b", a.doc).update);
      const snap = await h.store.snapshotBoard(BOARD, "round", "Round 1");
      expect(keys(snap.state)).toEqual(["a", "b"]);
      expect(snap.uptoSeq).toBeGreaterThan(0);
      expect(keys((await h.store.getSnapshotState(snap.id, BOARD))!)).toEqual(["a", "b"]);
      expect(await h.store.getSnapshotState(snap.id, BOARD2)).toBeNull(); // only through its own board
    });

    it("includes an update pushed just before and excludes one pushed after (and never loses it)", async () => {
      const a = update("a");
      h.seedLive(BOARD, a.update);
      const snap = await h.store.snapshotBoard(BOARD, "round", "R");
      h.seedLive(BOARD, update("late", a.doc).update); // another device, after publishing
      expect(keys(snap.state)).toEqual(["a"]);
      expect(keys((await h.store.getSnapshotState(snap.id, BOARD))!)).toEqual(["a"]);
      expect(keys((await h.store.getLiveState(BOARD))!)).toEqual(["a", "late"]);
    });

    it("a board with no data snapshots as an empty document at seq 0", async () => {
      const snap = await h.store.snapshotBoard(BOARD, "compaction", "Before restore");
      expect(snap.uptoSeq).toBe(0);
      expect(keys(snap.state)).toEqual([]);
    });

    it("lists snapshots newest first with their kind and label, and deletes one", async () => {
      h.seedLive(BOARD, update("a").update);
      const first = await h.store.snapshotBoard(BOARD, "compaction", "Before restore");
      h.clock.now = new Date(h.clock.now.getTime() + 1000);
      const second = await h.store.snapshotBoard(BOARD, "round", "Round 1");
      const list = await h.store.listSnapshots(BOARD);
      expect(list.map((s) => [s.id, s.kind, s.label])).toEqual([[second.id, "round", "Round 1"], [first.id, "compaction", "Before restore"]]);
      expect(list[0].createdAt >= list[1].createdAt).toBe(true);
      expect(await h.store.listSnapshots(BOARD2)).toEqual([]);
      await h.store.deleteSnapshot(first.id, BOARD2); // wrong board: no effect
      expect(await h.store.listSnapshots(BOARD)).toHaveLength(2);
      await h.store.deleteSnapshot(first.id, BOARD);
      expect((await h.store.listSnapshots(BOARD)).map((s) => s.id)).toEqual([second.id]);
    });
  });

  describe("insertRound", () => {
    it("creates a round readable through listRounds, getRound and latestRound", async () => {
      h.seedLive(BOARD, update("a").update);
      const snap = await h.store.snapshotBoard(BOARD, "round", "Round 1");
      const row = await h.store.insertRound(newRound({ snapshotId: snap.id, previews: { f1: { w480: "p/t/f1-w480.webp", w1280: "p/t/f1-w1280.webp", w: 1280, h: 720 } } }));
      expect(row).toMatchObject({ boardId: BOARD, number: 1, label: "Round 1", snapshotId: snap.id });
      expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(row.previews.f1.w).toBe(1280);
      expect(await h.store.getRound(row.id)).toEqual(row);
      expect((await h.store.latestRound(BOARD))!.id).toBe(row.id);
    });

    it("refuses a second round with the same number on a board, but numbers are per board", async () => {
      const s1 = await h.store.snapshotBoard(BOARD, "round", "a");
      const s2 = await h.store.snapshotBoard(BOARD2, "round", "b");
      await h.store.insertRound(newRound({ snapshotId: s1.id }));
      await expect(h.store.insertRound(newRound({ snapshotId: s1.id }))).rejects.toBeInstanceOf(RoundNumberTakenError);
      await expect(h.store.insertRound(newRound({ boardId: BOARD2, snapshotId: s2.id }))).resolves.toMatchObject({ number: 1, boardId: BOARD2 });
      expect((await h.store.listRounds(BOARD)).map((r) => r.number)).toEqual([1]);
    });
  });
});
