import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";
import { compact } from "@/lib/server/compaction";
import { MAX_STATE_BYTES, StateTooLargeError, decodeBoardState, loadBoardState, objectsFromState } from "@/lib/server/state";
import { appendUpdate, supabaseUpdatesDb, type UpdatesDb } from "@/lib/server/updates";
import { bytesToPgBytea } from "@/lib/sync/bytes";
import { createFakePg, type FakePg } from "./helpers/fake-pg";

const OWNER = "11111111-1111-4111-8111-111111111111";
const BOARD = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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

const shape = (id: string, over: Partial<NewObject> = {}): NewObject => ({ ...defaultsFor("shape"), id, ...over }) as NewObject;

/** A device: a BoardDoc whose every local update is pushed to the fake server. */
function device() {
  const doc = new BoardDoc();
  const updates: Uint8Array[] = [];
  doc.ydoc.on("update", (u: Uint8Array) => updates.push(u));
  return {
    doc,
    updates,
    async push() {
      for (const u of updates.splice(0)) await appendUpdate(db, BOARD, u, "dev");
    },
  };
}

describe("loadBoardState", () => {
  it("an empty board is an empty document at seq 0", async () => {
    const r = await loadBoardState(BOARD, db);
    expect(r.uptoSeq).toBe(0);
    expect(objectsFromState(r.state).size).toBe(0);
  });

  it("equals the snapshot plus every later update, applied in order, with the last seq", async () => {
    const d = device();
    d.doc.create(shape("a"));
    d.doc.create(shape("b"));
    await d.push();
    await compact(db, BOARD, { now: new Date(Date.now() + 3_600_000) });
    d.doc.update("a", { x: 400 });
    d.doc.create(shape("c"));
    await d.push();

    const r = await loadBoardState(BOARD, db);
    expect(r.uptoSeq).toBe(pg.tables.board_updates.at(-1)!.seq);
    const objs = objectsFromState(r.state);
    expect([...objs.keys()].sort()).toEqual(["a", "b", "c"]);
    expect(objs.get("a")!.x).toBe(400);
    expect(Y.encodeStateVector(docOf(r.state))).toEqual(Y.encodeStateVector(d.doc.ydoc));
  });

  it("does not use a round snapshot as its base (rounds never delete update rows)", async () => {
    const d = device();
    d.doc.create(shape("a"));
    await d.push();
    // a stale round snapshot with a high seq and different content
    const stale = new BoardDoc();
    stale.create(shape("stale"));
    pg.tables.board_snapshots.push({ id: "r1", board_id: BOARD, state: bytesToPgBytea(Y.encodeStateAsUpdate(stale.ydoc)), upto_seq: 99, kind: "round", label: "Round 1", created_at: new Date().toISOString() });
    d.doc.create(shape("b"));
    await d.push();
    const r = await loadBoardState(BOARD, db);
    expect([...objectsFromState(r.state).keys()].sort()).toEqual(["a", "b"]);
  });

  it("skips an update that is not a Yjs update, like compaction does", async () => {
    const d = device();
    d.doc.create(shape("a"));
    await d.push();
    await appendUpdate(db, BOARD, new Uint8Array([255, 255, 255, 255, 255, 255, 255]), "dev");
    d.doc.create(shape("b"));
    await d.push();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await loadBoardState(BOARD, db);
    expect([...objectsFromState(r.state).keys()].sort()).toEqual(["a", "b"]);
    warn.mockRestore();
  });

  it("refuses a board whose merged state is over the size cap", async () => {
    const d = device();
    d.doc.create(shape("a"));
    await d.push();
    await expect(loadBoardState(BOARD, db, { maxBytes: 10 })).rejects.toBeInstanceOf(StateTooLargeError);
    expect(MAX_STATE_BYTES).toBeGreaterThan(1_000_000);
  });
});

describe("decodeBoardState", () => {
  it("reads validated objects and a fingerprint of every text, and skips invalid objects", () => {
    const doc = new BoardDoc();
    doc.create({ ...defaultsFor("sticky"), id: "s" } as NewObject);
    const frag = doc.content("s")!;
    const p = new Y.XmlElement("paragraph");
    p.insert(0, [new Y.XmlText("hello")]);
    frag.insert(0, [p]);
    // an object the validator rejects (negative size) and a non-object entry
    const objects = doc.ydoc.getMap<unknown>("objects");
    const bad = new Y.Map<unknown>();
    bad.set("type", "shape");
    bad.set("w", -5);
    objects.set("bad", bad);
    objects.set("junk", "not an object");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = decodeBoardState(Y.encodeStateAsUpdate(doc.ydoc));
    warn.mockRestore();
    expect([...out.objects.keys()]).toEqual(["s"]);
    expect(out.texts.get("s")).toMatch(/^[0-9a-f]+$/);
    const empty = new BoardDoc();
    empty.create({ ...defaultsFor("sticky"), id: "s" } as NewObject);
    expect(decodeBoardState(Y.encodeStateAsUpdate(empty.ydoc)).texts.get("s")).not.toBe(out.texts.get("s"));
  });

  it("throws on bytes that are not a Yjs update", () => {
    expect(() => decodeBoardState(new Uint8Array([255, 255, 255, 255]))).toThrow();
  });
});

function docOf(state: Uint8Array): Y.Doc {
  const d = new Y.Doc();
  Y.applyUpdate(d, state);
  return d;
}
