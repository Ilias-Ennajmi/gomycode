import * as Y from "yjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";
import { PREVIEW_TOKEN, previewKeys, publishRound, snapshotRound } from "@/lib/server/rounds";
import { MemoryShareStore } from "@/lib/server/share-store-memory";
import { RoundNumberTakenError, type NewRound, type ShareStore } from "@/lib/server/share-store";

const OWNER = "11111111-1111-4111-8111-111111111111";
const BOARD = "55555555-5555-4555-8555-555555555555";
const TOKEN = "abcdefghijklmnopqrstuv"; // 22 chars

let store: MemoryShareStore;
let doc: BoardDoc;
let pushed: Uint8Array[];

beforeEach(() => {
  store = new MemoryShareStore();
  store.seedBoard({ id: BOARD, ownerId: OWNER, title: "Brand" });
  doc = new BoardDoc();
  pushed = [];
  doc.ydoc.on("update", (u: Uint8Array) => pushed.push(u));
});
/** The edits made since the last push reach the server (another device syncing). */
const push = () => pushed.splice(0).forEach((u) => store.seedLiveState(BOARD, u));
const obj = (type: "shape" | "frame" | "sticky", id: string, over: Partial<NewObject> = {}): NewObject => ({ ...defaultsFor(type), id, ...over }) as NewObject;
const frames = (...ids: string[]) => ids.map((frameId) => ({ frameId, name: frameId, w: 1280, h: 720 }));
const args = (over: Record<string, unknown> = {}) => ({ boardId: BOARD, ownerId: OWNER, label: "", previewToken: TOKEN, frames: [] as ReturnType<typeof frames>, ...over });

describe("snapshotRound", () => {
  it("stores the merged server state as a round snapshot", async () => {
    doc.create(obj("shape", "a"));
    push();
    const r = await snapshotRound(BOARD, "Round 1", store);
    expect(r.snapshotId).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.uptoSeq).toBe(1);
    const saved = new Y.Doc();
    Y.applyUpdate(saved, r.state);
    expect([...saved.getMap("objects").keys()]).toEqual(["a"]);
    const kinds = (await store.listSnapshots(BOARD)).map((s) => s.kind);
    expect(kinds).toEqual(["round"]);
  });
});

describe("publishRound", () => {
  it("numbers rounds 1, 2, 3 and diffs each against the previous round's snapshot", async () => {
    doc.create(obj("frame", "f1"));
    doc.create(obj("shape", "a", { parentId: "f1" }));
    push();
    const r1 = await publishRound(args({ label: "Direction A" }), store);
    expect(r1).toMatchObject({ number: 1, label: "Direction A", boardId: BOARD });
    expect(r1.diff.added.sort()).toEqual(["a", "f1"]); // no previous round: everything is added

    doc.update("a", { x: 500 });
    doc.create(obj("shape", "b", { parentId: "f1" }));
    push();
    const r2 = await publishRound(args(), store);
    expect(r2).toMatchObject({ number: 2, label: "Round 2" });
    expect(r2.diff).toMatchObject({ added: ["b"], changed: ["a"], removed: [] });
    expect(r2.diff.byFrame).toEqual({ f1: { added: 1, changed: 1, removed: 0 } });
    expect(r2.snapshotId).not.toBe(r1.snapshotId);

    doc.remove(["b"]);
    push();
    const r3 = await publishRound(args({ label: "  " }), store);
    expect(r3.label).toBe("Round 3");
    expect(r3.diff).toMatchObject({ added: [], changed: [], removed: ["b"] });
    expect((await store.listRounds(BOARD)).map((r) => r.number)).toEqual([3, 2, 1]);
  });

  it("a text edit between rounds is a change", async () => {
    doc.create(obj("sticky", "s"));
    push();
    await publishRound(args(), store);
    const p = new Y.XmlElement("paragraph");
    p.insert(0, [new Y.XmlText("new words")]);
    doc.content("s")!.insert(0, [p]);
    push();
    expect((await publishRound(args(), store)).diff.changed).toEqual(["s"]);
  });

  it("a concurrent publish that took the same number retries once and gets the next one", async () => {
    doc.create(obj("shape", "a"));
    push();
    // Both publishes read "no round yet" before either inserts.
    const gate: Promise<void>[] = [];
    let release!: () => void;
    const open = new Promise<void>((r) => (release = r));
    const racing: ShareStore = Object.create(store);
    racing.latestRound = async (boardId) => {
      const result = await store.latestRound(boardId);
      if (gate.length < 2) {
        gate.push(open);
        if (gate.length === 2) release();
        await open;
      }
      return result;
    };
    let collisions = 0;
    racing.insertRound = async (row) => {
      try {
        return await store.insertRound(row);
      } catch (e) {
        collisions++;
        throw e;
      }
    };
    const [a, b] = await Promise.all([publishRound(args({ label: "A" }), racing), publishRound(args({ label: "B" }), racing)]);
    expect(collisions).toBe(1);
    expect([a.number, b.number].sort()).toEqual([1, 2]);
    expect(await store.listRounds(BOARD)).toHaveLength(2);
  });

  it("gives up after one retry, tells the caller, and leaves no orphan snapshot", async () => {
    doc.create(obj("shape", "a"));
    push();
    const hostile: ShareStore = Object.create(store);
    hostile.insertRound = async (row: NewRound) => {
      throw new RoundNumberTakenError(row.boardId, row.number);
    };
    await expect(publishRound(args(), hostile)).rejects.toBeInstanceOf(RoundNumberTakenError);
    expect(await store.listSnapshots(BOARD)).toEqual([]);
    expect(await store.listRounds(BOARD)).toEqual([]);
  });

  it("a failure other than a taken number also cleans up the snapshot and rethrows", async () => {
    push();
    const broken: ShareStore = Object.create(store);
    broken.insertRound = async () => {
      throw new Error("db down");
    };
    await expect(publishRound(args(), broken)).rejects.toThrow("db down");
    expect(await store.listSnapshots(BOARD)).toEqual([]);
  });

  it("the snapshot holds what the server had at that moment: a push just before is in, one after is not, and it is not lost", async () => {
    doc.create(obj("shape", "before"));
    push(); // another device pushed just before publishing
    const round = await publishRound(args(), store);
    doc.create(obj("shape", "after")); // an offline device's edit arriving later
    push();
    const saved = new Y.Doc();
    Y.applyUpdate(saved, (await store.getSnapshotState(round.snapshotId, BOARD))!);
    expect([...saved.getMap("objects").keys()]).toEqual(["before"]);
    // ... but it is in the live board and in the next round
    const live = new Y.Doc();
    Y.applyUpdate(live, (await store.getLiveState(BOARD))!);
    expect([...live.getMap("objects").keys()].sort()).toEqual(["after", "before"]);
    const next = await publishRound(args(), store);
    expect(next.diff.added).toEqual(["after"]);
  });

  describe("previews", () => {
    beforeEach(() => {
      doc.create(obj("frame", "f1"));
      doc.create(obj("frame", "f2"));
      push();
    });

    it("keeps keys under this token for frames that exist, with their pixel size", async () => {
      const r = await publishRound(args({ frames: [{ frameId: "f1", name: "One", w: 1280, h: 720 }, { frameId: "f2", name: "Two", w: 1280, h: 1810 }] }), store);
      expect(r.previews).toEqual({
        f1: { w480: `p/${TOKEN}/f1-w480.webp`, w1280: `p/${TOKEN}/f1-w1280.webp`, w: 1280, h: 720 },
        f2: { w480: `p/${TOKEN}/f2-w480.webp`, w1280: `p/${TOKEN}/f2-w1280.webp`, w: 1280, h: 1810 },
      });
    });

    it("drops frame ids that could escape the key, and frames the board does not have", async () => {
      const r = await publishRound(args({ frames: frames("f1", "../../evil", "a/b", "ghost", "x".repeat(41)) }), store);
      expect(Object.keys(r.previews)).toEqual(["f1"]);
    });

    it("keeps no previews without a valid token (the keys would not be ours)", async () => {
      for (const previewToken of [null, "short", "has/slash_______________", `${TOKEN}x`]) {
        expect((await publishRound(args({ previewToken, frames: frames("f1") }), store)).previews).toEqual({});
      }
    });

    it("clamps hostile sizes", async () => {
      const r = await publishRound(args({ frames: [{ frameId: "f1", name: "x", w: Number.NaN, h: 1e12 }] }), store);
      expect(r.previews.f1.w).toBeGreaterThanOrEqual(1);
      expect(r.previews.f1.h).toBeLessThanOrEqual(100_000);
    });
  });

  it("trims and bounds the label", async () => {
    expect((await publishRound(args({ label: `  ${"x".repeat(300)}  ` }), store)).label).toHaveLength(120);
    expect((await publishRound(args({ label: "a\u0000b‮c" }), store)).label).toBe("abc");
  });
});

describe("previewKeys", () => {
  it("builds the keys the viewer reads", () => {
    expect(previewKeys(TOKEN, "f1")).toEqual({ w480: `p/${TOKEN}/f1-w480.webp`, w1280: `p/${TOKEN}/f1-w1280.webp` });
    expect(PREVIEW_TOKEN.test(TOKEN)).toBe(true);
  });
  it("is silent in the console", () => {
    const warn = vi.spyOn(console, "warn");
    previewKeys(TOKEN, "f1");
    expect(warn).not.toHaveBeenCalled();
  });
});
