import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { docFromState } from "@/lib/engine/doc/from-state";
import { restoreAsCopy, restoreSnapshotInto } from "@/lib/engine/doc/restore";
import { defaultsFor } from "@/lib/engine/model/defaults";
import { decodeDoc } from "@/lib/engine/rounds/decode";
import type { CanvasObject, NewObject } from "@/lib/engine/model/types";

const mk = (type: "shape" | "frame" | "sticky" | "text", id: string, over: Record<string, unknown> = {}) => ({ ...defaultsFor(type), id, ...over }) as unknown as NewObject;
const stateOf = (d: BoardDoc) => Y.encodeStateAsUpdate(d.ydoc);
const say = (d: BoardDoc, id: string, text: string) => {
  const p = new Y.XmlElement("paragraph");
  p.insert(0, [new Y.XmlText(text)]);
  d.content(id)!.insert(0, [p]);
};
const textOf = (d: BoardDoc, id: string) => d.content(id)!.toString();
/** Objects without the save timestamps, for equality. */
const plain = (d: BoardDoc) => d.all().map((o) => ({ ...o, updatedAt: 0 }) as CanvasObject);

/** A board the way it was "when the round was published": a frame, two shapes, a sticky with text. */
function publishedBoard(): BoardDoc {
  const d = new BoardDoc();
  d.create(mk("frame", "f1", { name: "Hero" }));
  d.create(mk("shape", "a", { parentId: "f1", x: 10 }));
  d.create(mk("shape", "b", { parentId: "f1", x: 20 }));
  d.create(mk("sticky", "s"));
  say(d, "s", "original words");
  d.meta.title = "Brand refresh";
  d.stopCapturing();
  return d;
}

/** The same board, edited afterwards: a moved, b removed, c added, the sticky reworded. */
function laterVersionOf(snapshot: Uint8Array): BoardDoc {
  const d = docFromState(snapshot);
  d.update("a", { x: 500 });
  d.stopCapturing();
  d.remove(["b"]);
  d.stopCapturing();
  d.create(mk("shape", "c", { parentId: "f1", x: 30 }));
  d.stopCapturing();
  d.content("s")!.delete(0, d.content("s")!.length);
  say(d, "s", "reworded");
  d.stopCapturing();
  return d;
}

describe("restoreSnapshotInto", () => {
  it("makes the objects equal the snapshot's, removes later ones and restores rich text", () => {
    const snapshot = stateOf(publishedBoard());
    const now = laterVersionOf(snapshot);
    const counts = restoreSnapshotInto(now, snapshot);
    const want = publishedBoard();
    expect(plain(now).map((o) => o.id).sort()).toEqual(["a", "b", "f1", "s"]);
    expect(now.get("a")!.x).toBe(10);
    expect(now.get("c")).toBeUndefined();
    expect(textOf(now, "s")).toContain("original words");
    expect(textOf(now, "s")).not.toContain("reworded");
    expect(counts).toEqual({ added: 1, removed: 1, changed: 2 }); // b back, c gone, a and s differ
    // and everything else equals a fresh copy of the published board
    const a = decodeDoc(now).objects;
    const b = decodeDoc(docFromState(snapshot)).objects;
    for (const [id, o] of b) expect({ ...a.get(id)!, updatedAt: 0 }).toEqual({ ...o, updatedAt: 0 });
    void want;
  });

  it("is one undo step: a single undo() returns the exact pre-restore state, redo restores again", () => {
    const snapshot = stateOf(publishedBoard());
    const now = laterVersionOf(snapshot);
    const before = JSON.stringify(plain(now));
    const textBefore = textOf(now, "s");
    restoreSnapshotInto(now, snapshot);
    const restored = JSON.stringify(plain(now));
    expect(restored).not.toBe(before);
    now.undo();
    expect(JSON.stringify(plain(now))).toBe(before);
    expect(textOf(now, "s")).toBe(textBefore);
    expect(now.canUndo()).toBe(true); // the earlier edits are still there: restore never rewinds history
    now.redo();
    expect(JSON.stringify(plain(now))).toBe(restored);
  });

  it("is its own undo step even right after an edit (no merge into the previous step)", () => {
    const snapshot = stateOf(publishedBoard());
    const now = laterVersionOf(snapshot);
    now.update("a", { y: 777 }); // an edit a moment before restoring, no stopCapturing
    restoreSnapshotInto(now, snapshot);
    now.undo();
    expect(now.get("a")!.y).toBe(777);
    expect(now.get("a")!.x).toBe(500);
  });

  it("never rewinds Yjs history: the update it makes is an ordinary one that a replica applies", () => {
    const snapshot = stateOf(publishedBoard());
    const now = laterVersionOf(snapshot);
    const replica = docFromState(stateOf(now));
    const sent: Uint8Array[] = [];
    now.ydoc.on("update", (u: Uint8Array) => sent.push(u));
    restoreSnapshotInto(now, snapshot);
    expect(sent.length).toBeGreaterThan(0);
    for (const u of sent) Y.applyUpdate(replica.ydoc, u);
    expect(JSON.stringify(plain(replica))).toBe(JSON.stringify(plain(now)));
    expect(textOf(replica, "s")).toBe(textOf(now, "s"));
  });

  it("a remote edit that arrives after the restore merges without throwing and survives", () => {
    const snapshot = stateOf(publishedBoard());
    const now = laterVersionOf(snapshot);
    const other = docFromState(stateOf(now)); // device B, in step with A before the restore
    restoreSnapshotInto(now, snapshot);
    other.create(mk("shape", "fromB", { x: 99 })); // B, offline, adds an object
    other.update("a", { y: 123 });
    const fromB = Y.encodeStateAsUpdate(other.ydoc, Y.encodeStateVector(now.ydoc));
    expect(() => Y.applyUpdate(now.ydoc, fromB)).not.toThrow();
    expect(now.get("fromB")).toMatchObject({ x: 99 });
    expect(now.get("a")).toMatchObject({ x: 10, y: 123 }); // A's restored x, B's own new y: property-level merge
    expect(now.get("b")).toBeDefined();
    // and B converges on the same state
    Y.applyUpdate(other.ydoc, Y.encodeStateAsUpdate(now.ydoc, Y.encodeStateVector(other.ydoc)));
    expect(JSON.stringify(plain(other))).toBe(JSON.stringify(plain(now)));
  });

  it("restoring the same snapshot twice is idempotent and adds no second undo step", () => {
    const snapshot = stateOf(publishedBoard());
    const now = laterVersionOf(snapshot);
    restoreSnapshotInto(now, snapshot);
    const stack = now.undoManager.undoStack.length;
    const once = JSON.stringify(plain(now));
    const again = restoreSnapshotInto(now, snapshot);
    expect(again).toEqual({ added: 0, removed: 0, changed: 0 });
    expect(JSON.stringify(plain(now))).toBe(once);
    expect(now.undoManager.undoStack.length).toBe(stack);
  });

  it("an invalid object in the snapshot is skipped (and the rest still restores)", () => {
    const d = publishedBoard();
    const bad = new Y.Map<unknown>();
    bad.set("type", "shape");
    bad.set("w", -5);
    d.ydoc.getMap<unknown>("objects").set("bad", bad);
    d.ydoc.getMap<unknown>("objects").set("junk", "not an object");
    const snapshot = stateOf(d);
    const now = laterVersionOf(stateOf(publishedBoard()));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    restoreSnapshotInto(now, snapshot);
    warn.mockRestore();
    expect(now.get("a")!.x).toBe(10);
    expect(now.ydoc.getMap("objects").has("bad")).toBe(false);
    expect(now.ydoc.getMap("objects").has("junk")).toBe(false);
  });

  it("leaves the board's title and settings alone", () => {
    const snapshot = stateOf(publishedBoard());
    const now = laterVersionOf(snapshot);
    now.meta.title = "Renamed since";
    now.meta.gutter = 40;
    restoreSnapshotInto(now, snapshot);
    expect(now.meta.title).toBe("Renamed since");
    expect(now.meta.gutter).toBe(40);
  });

  it("refuses bytes that are not a Yjs update and changes nothing", () => {
    const now = laterVersionOf(stateOf(publishedBoard()));
    const before = JSON.stringify(plain(now));
    expect(() => restoreSnapshotInto(now, new Uint8Array([255, 255, 255, 255, 255]))).toThrow();
    expect(JSON.stringify(plain(now))).toBe(before);
  });

  it("an empty snapshot clears the board (undoably)", () => {
    const now = publishedBoard();
    const empty = stateOf(new BoardDoc());
    const counts = restoreSnapshotInto(now, empty);
    expect(now.all()).toEqual([]);
    expect(counts.removed).toBe(4);
    now.undo();
    expect(now.all()).toHaveLength(4);
  });

  it("a thousand-object restore stays one transaction", () => {
    const big = new BoardDoc();
    big.createMany(Array.from({ length: 1000 }, (_, i) => mk("shape", `o${i}`, { x: i })));
    const snapshot = stateOf(big);
    const now = docFromState(snapshot);
    for (let i = 0; i < 1000; i += 2) now.update(`o${i}`, { x: -1 });
    let transactions = 0;
    now.ydoc.on("afterTransaction", () => transactions++);
    restoreSnapshotInto(now, snapshot);
    expect(transactions).toBe(1);
    expect(now.get("o10")!.x).toBe(10);
  });
});

describe("restoreAsCopy", () => {
  const deps = () => {
    const made: { id: string; title: string; doc: BoardDoc }[] = [];
    return {
      made,
      createBoard: vi.fn(async (title: string) => {
        const id = `new${made.length + 1}`;
        made.push({ id, title, doc: new BoardDoc() });
        return id;
      }),
      openDoc: vi.fn(async (id: string) => made.find((m) => m.id === id)!.doc),
    };
  };

  it("creates a NEW board holding the snapshot, with the given title; the source is untouched", async () => {
    const source = laterVersionOf(stateOf(publishedBoard()));
    const snapshot = stateOf(publishedBoard());
    const sourceBefore = JSON.stringify(plain(source));
    const d = deps();
    const id = await restoreAsCopy(snapshot, d, "Brand refresh · Round 1");
    expect(id).toBe("new1");
    const copy = d.made[0].doc;
    expect(copy.meta.title).toBe("Brand refresh · Round 1");
    expect(copy.all().map((o) => o.id).sort()).toEqual(["a", "b", "f1", "s"]);
    expect(textOf(copy, "s")).toContain("original words");
    expect(JSON.stringify(plain(source))).toBe(sourceBefore);
  });

  it("rejects bad bytes before creating any board", async () => {
    const d = deps();
    await expect(restoreAsCopy(new Uint8Array([255, 255, 255, 255, 255]), d, "x")).rejects.toThrow();
    expect(d.createBoard).not.toHaveBeenCalled();
  });

  it("removes the half-made board when opening it fails", async () => {
    const d = deps();
    const discard = vi.fn(async () => {});
    await expect(restoreAsCopy(stateOf(publishedBoard()), { ...d, openDoc: async () => { throw new Error("idb"); }, discardBoard: discard }, "x")).rejects.toThrow("idb");
    expect(discard).toHaveBeenCalledWith("new1");
  });
});
