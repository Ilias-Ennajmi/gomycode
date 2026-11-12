import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { BoardDoc, LOCAL_ORIGIN } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { ArrowObj, CanvasObject, NewObject } from "@/lib/engine/model/types";

function shape(over: Partial<NewObject> = {}): NewObject {
  return { ...defaultsFor("shape"), ...over } as NewObject;
}
function sticky(over: Partial<NewObject> = {}): NewObject {
  return { ...defaultsFor("sticky"), ...over } as NewObject;
}
function frame(over: Partial<NewObject> = {}): NewObject {
  return { ...defaultsFor("frame"), w: 400, h: 300, ...over } as NewObject;
}
function group(over: Partial<NewObject> = {}): NewObject {
  return { ...defaultsFor("group"), ...over } as NewObject;
}
function arrow(over: Partial<NewObject> = {}): NewObject {
  return { ...defaultsFor("arrow"), ...over } as NewObject;
}

function sync(from: BoardDoc, to: BoardDoc, origin: unknown = "remote") {
  Y.applyUpdate(to.ydoc, Y.encodeStateAsUpdate(from.ydoc, Y.encodeStateVector(to.ydoc)), origin);
}
function snapshot(d: BoardDoc) {
  return JSON.parse(JSON.stringify(d.all()));
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

describe("BoardDoc basics", () => {
  it("creates and reads back an object", () => {
    const d = new BoardDoc();
    const id = d.create(shape({ x: 10, y: 20 }));
    const o = d.get(id)!;
    expect(o.id).toBe(id);
    expect(o).toMatchObject({ type: "shape", x: 10, y: 20, w: 160, h: 120 });
    expect(o.index.length).toBeGreaterThan(0);
    expect(o.createdAt).toBeGreaterThan(0);
    expect(o.updatedAt).toBe(o.createdAt);
    expect(d.get("nope")).toBeUndefined();
  });

  it("honours a supplied id and rejects a duplicate id", () => {
    const d = new BoardDoc();
    expect(d.create(shape({ id: "mine" }))).toBe("mine");
    expect(() => d.create(shape({ id: "mine" }))).toThrow();
  });

  it("throws on creating an invalid object and writes nothing", () => {
    const d = new BoardDoc();
    expect(() => d.create(shape({ x: NaN }))).toThrow();
    expect(d.all()).toHaveLength(0);
  });

  it("all() follows index order; new objects go on top", () => {
    const d = new BoardDoc();
    const a = d.create(shape());
    const b = d.create(shape());
    const c = d.create(shape());
    expect(d.all().map((o) => o.id)).toEqual([a, b, c]);
    d.update(a, { index: d.get(c)!.index + "V" });
    expect(d.all().map((o) => o.id)).toEqual([b, c, a]);
  });

  it("ties on index are broken by id so order is deterministic", () => {
    const d = new BoardDoc();
    d.create(shape({ id: "b", index: "a5" }));
    d.create(shape({ id: "a", index: "a5" }));
    expect(d.all().map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("createMany assigns ascending indexes and returns ids in order", () => {
    const d = new BoardDoc();
    const ids = d.createMany([shape(), shape(), shape()]);
    expect(d.all().map((o) => o.id)).toEqual(ids);
    const idx = ids.map((i) => d.get(i)!.index);
    expect([...idx].sort()).toEqual(idx);
    expect(new Set(idx).size).toBe(3);
  });

  it("update patches fields and changes updatedAt", () => {
    const d = new BoardDoc();
    const id = d.create(shape());
    const before = d.get(id)!;
    d.update(id, { x: 99, opacity: 3 });
    const after = d.get(id)!;
    expect(after.x).toBe(99);
    expect(after.opacity).toBe(1);
    expect(after.updatedAt).toBeGreaterThan(before.updatedAt);
    expect(after.createdAt).toBe(before.createdAt);
  });

  it("update cannot change id, type or createdAt", () => {
    const d = new BoardDoc();
    const id = d.create(shape());
    const before = d.get(id)!;
    d.update(id, { id: "other", type: "frame", createdAt: 5 } as Partial<CanvasObject>);
    const after = d.get(id)!;
    expect(after.id).toBe(id);
    expect(after.type).toBe("shape");
    expect(after.createdAt).toBe(before.createdAt);
    expect(d.get("other")).toBeUndefined();
  });

  it("update with an invalid result is ignored and warned about", () => {
    const d = new BoardDoc();
    const id = d.create(shape({ x: 5 }));
    d.update(id, { x: NaN });
    expect(d.get(id)!.x).toBe(5);
    expect(warn).toHaveBeenCalled();
  });

  it("update of a missing id and a no-op update do nothing", () => {
    const d = new BoardDoc();
    const id = d.create(shape());
    const seen: Set<string>[] = [];
    d.onChange((ids) => seen.push(ids));
    d.update("missing", { x: 1 });
    d.update(id, { x: d.get(id)!.x });
    expect(seen).toHaveLength(0);
  });

  it("content() exists for text, sticky and shape only", () => {
    const d = new BoardDoc();
    const t = d.create({ ...defaultsFor("text") } as NewObject);
    const s = d.create(sticky());
    const sh = d.create(shape());
    const f = d.create(frame());
    expect(d.content(t)).toBeInstanceOf(Y.XmlFragment);
    expect(d.content(s)).toBeInstanceOf(Y.XmlFragment);
    expect(d.content(sh)).toBeInstanceOf(Y.XmlFragment);
    expect(d.content(f)).toBeUndefined();
    expect(d.content("missing")).toBeUndefined();
  });

  it("childrenOf lists children in z-order, null = top level", () => {
    const d = new BoardDoc();
    const f = d.create(frame());
    const a = d.create(shape({ parentId: f }));
    const b = d.create(shape({ parentId: f }));
    const free = d.create(shape());
    expect(d.childrenOf(f).map((o) => o.id)).toEqual([a, b]);
    expect(d.childrenOf(null).map((o) => o.id)).toEqual([f, free]);
  });

  it("meta title and schemaVersion round trip and sync", () => {
    const d = new BoardDoc();
    expect(d.meta.title).toBe("Untitled");
    expect(d.meta.schemaVersion).toBe(1);
    d.meta.title = "Moodboard";
    d.meta.schemaVersion = 2;
    const d2 = new BoardDoc();
    sync(d, d2);
    expect(d2.meta.title).toBe("Moodboard");
    expect(d2.meta.schemaVersion).toBe(2);
  });

  it("uses the documented Yjs layout", () => {
    const d = new BoardDoc();
    const id = d.create(sticky());
    const m = d.ydoc.getMap<Y.Map<unknown>>("objects").get(id)!;
    expect(m).toBeInstanceOf(Y.Map);
    expect(m.get("type")).toBe("sticky");
    expect(m.get("content")).toBeInstanceOf(Y.XmlFragment);
    expect(d.ydoc.getMap("meta")).toBeDefined();
  });

  it("wraps an existing Y.Doc and sees its objects", () => {
    const a = new BoardDoc();
    const id = a.create(shape());
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(a.ydoc));
    const b = new BoardDoc(ydoc);
    expect(b.get(id)?.id).toBe(id);
  });
});

describe("BoardDoc remove", () => {
  it("removing a frame removes its descendants", () => {
    const d = new BoardDoc();
    const f = d.create(frame());
    const a = d.create(shape({ parentId: f }));
    const g = d.create(group({ parentId: f }));
    const deep = d.create(shape({ parentId: g }));
    const keep = d.create(shape());
    d.remove([f]);
    for (const id of [f, a, g, deep]) expect(d.get(id)).toBeUndefined();
    expect(d.get(keep)).toBeDefined();
    expect(d.all().map((o) => o.id)).toEqual([keep]);
  });

  it("removing a bound target converts the arrow terminal to a point at the anchor position", () => {
    const d = new BoardDoc();
    const t = d.create(shape({ x: 100, y: 200, w: 100, h: 50 }));
    const other = d.create(shape({ x: 500, y: 500 }));
    const a = d.create(
      arrow({
        start: { kind: "bound", id: t, anchor: { x: 1, y: 0.5 } },
        end: { kind: "bound", id: other, anchor: { x: 0, y: 0 } },
      }),
    );
    d.remove([t]);
    const arr = d.get(a) as ArrowObj;
    expect(arr.start).toEqual({ kind: "point", x: 200, y: 225 });
    expect(arr.end).toEqual({ kind: "bound", id: other, anchor: { x: 0, y: 0 } });
  });

  it("accounts for the rotation of the removed target", () => {
    const d = new BoardDoc();
    // 100x50 rect centred at (150, 125), rotated 90deg; right-middle anchor -> centre + (0, +50)
    const t = d.create(shape({ x: 100, y: 100, w: 100, h: 50, rotation: Math.PI / 2 }));
    const a = d.create(arrow({ end: { kind: "bound", id: t, anchor: { x: 1, y: 0.5 } } }));
    d.remove([t]);
    const end = (d.get(a) as ArrowObj).end;
    expect(end.kind).toBe("point");
    if (end.kind === "point") {
      expect(end.x).toBeCloseTo(150, 9);
      expect(end.y).toBeCloseTo(175, 9);
    }
  });

  it("unbinds arrows bound to descendants of a removed frame, and removes arrows inside it", () => {
    const d = new BoardDoc();
    const f = d.create(frame());
    const child = d.create(shape({ parentId: f, x: 10, y: 10, w: 20, h: 20 }));
    const inside = d.create(arrow({ parentId: f }));
    const outside = d.create(arrow({ start: { kind: "bound", id: child, anchor: { x: 0, y: 0 } } }));
    d.remove([f]);
    expect(d.get(inside)).toBeUndefined();
    expect((d.get(outside) as ArrowObj).start).toEqual({ kind: "point", x: 10, y: 10 });
  });

  it("removing missing or duplicate ids is harmless", () => {
    const d = new BoardDoc();
    const a = d.create(shape());
    d.remove(["nope", a, a]);
    expect(d.all()).toHaveLength(0);
  });

  it("is safe against parent cycles in remote data", () => {
    const d = new BoardDoc();
    const a = d.create(shape());
    const b = d.create(shape({ parentId: a }));
    d.ydoc.transact(() => {
      d.ydoc.getMap<Y.Map<unknown>>("objects").get(a)!.set("parentId", b);
    }, "remote");
    expect(() => d.remove([a])).not.toThrow();
    expect(d.all()).toHaveLength(0);
  });
});

describe("BoardDoc undo / redo", () => {
  it("undoes and redoes a multi-object transaction in one step", () => {
    const d = new BoardDoc();
    d.transact(() => {
      d.create(shape());
      d.create(shape());
      d.create(shape());
    });
    expect(d.all()).toHaveLength(3);
    expect(d.canUndo()).toBe(true);
    d.undo();
    expect(d.all()).toHaveLength(0);
    expect(d.canRedo()).toBe(true);
    d.redo();
    expect(d.all()).toHaveLength(3);
    expect(d.canRedo()).toBe(false);
  });

  it("stopCapturing separates undo steps; quick edits otherwise merge (captureTimeout)", () => {
    const d = new BoardDoc();
    const id = d.create(shape({ x: 0 }));
    d.stopCapturing();
    d.update(id, { x: 1 });
    d.update(id, { x: 2 });
    d.stopCapturing();
    d.update(id, { x: 3 });
    d.undo();
    expect(d.get(id)!.x).toBe(2);
    d.undo();
    expect(d.get(id)!.x).toBe(0);
    d.undo();
    expect(d.get(id)).toBeUndefined();
    expect(d.canUndo()).toBe(false);
  });

  it("undoing a removal restores the object, its children and arrow bindings", () => {
    const d = new BoardDoc();
    const f = d.create(frame());
    const child = d.create(shape({ parentId: f, x: 10, y: 10, w: 20, h: 20 }));
    const a = d.create(arrow({ start: { kind: "bound", id: child, anchor: { x: 0, y: 0 } } }));
    d.stopCapturing();
    d.remove([f]);
    expect(d.get(child)).toBeUndefined();
    d.undo();
    expect(d.get(f)).toBeDefined();
    expect(d.get(child)).toBeDefined();
    expect((d.get(a) as ArrowObj).start).toEqual({ kind: "bound", id: child, anchor: { x: 0, y: 0 } });
  });

  it("a remote update is not undone by undo()", () => {
    const local = new BoardDoc();
    const remote = new BoardDoc();
    const mine = local.create(shape());
    local.stopCapturing();
    const theirs = remote.create(shape());
    sync(remote, local);
    expect(local.get(theirs)).toBeDefined();
    local.undo();
    expect(local.get(mine)).toBeUndefined();
    expect(local.get(theirs)).toBeDefined();
    expect(local.canUndo()).toBe(false);
  });

  it("changes applied with LOCAL_ORIGIN through ydoc.transact are undoable", () => {
    const d = new BoardDoc();
    const id = d.create(shape());
    d.stopCapturing();
    d.ydoc.transact(() => {
      d.ydoc.getMap<Y.Map<unknown>>("objects").get(id)!.set("x", 42);
    }, LOCAL_ORIGIN);
    expect(d.get(id)!.x).toBe(42);
    d.undo();
    expect(d.get(id)!.x).toBe(0);
  });

  it("meta changes are not part of undo history", () => {
    const d = new BoardDoc();
    d.meta.title = "A";
    expect(d.canUndo()).toBe(false);
  });
});

describe("BoardDoc onChange", () => {
  it("reports exactly the touched ids with the transaction origin", () => {
    const d = new BoardDoc();
    const a = d.create(shape());
    const b = d.create(shape());
    d.create(shape());
    const calls: { ids: string[]; origin: unknown }[] = [];
    d.onChange((ids, origin) => calls.push({ ids: [...ids].sort(), origin }));
    d.update(a, { x: 5 });
    expect(calls).toEqual([{ ids: [a], origin: LOCAL_ORIGIN }]);
    calls.length = 0;
    d.transact(() => {
      d.update(a, { x: 6 });
      d.update(b, { x: 6 });
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].ids).toEqual([a, b].sort());
  });

  it("reports created and removed ids, and remote changes with their origin", () => {
    const d = new BoardDoc();
    const calls: { ids: string[]; origin: unknown }[] = [];
    d.onChange((ids, origin) => calls.push({ ids: [...ids], origin }));
    const a = d.create(shape());
    expect(calls.at(-1)!.ids).toEqual([a]);
    d.remove([a]);
    expect(calls.at(-1)!.ids).toEqual([a]);

    const other = new BoardDoc();
    const r = other.create(shape());
    sync(other, d, "remote");
    expect(calls.at(-1)).toEqual({ ids: [r], origin: "remote" });
  });

  it("reports text edits in the content fragment as a touch of the owner", () => {
    const d = new BoardDoc();
    const id = d.create(sticky());
    const calls: string[][] = [];
    d.onChange((ids) => calls.push([...ids]));
    const frag = d.content(id)!;
    d.ydoc.transact(() => {
      const p = new Y.XmlElement("paragraph");
      p.insert(0, [new Y.XmlText("hello")]);
      frag.insert(0, [p]);
    });
    expect(calls).toEqual([[id]]);
  });

  it("unsubscribe stops notifications", () => {
    const d = new BoardDoc();
    const cb = vi.fn();
    const off = d.onChange(cb);
    d.create(shape());
    off();
    d.create(shape());
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe("BoardDoc validation of stored data", () => {
  it("skips invalid objects written directly and warns once", () => {
    const d = new BoardDoc();
    const good = d.create(shape());
    const objects = d.ydoc.getMap<Y.Map<unknown>>("objects");
    d.ydoc.transact(() => {
      const bad = new Y.Map<unknown>();
      objects.set("bad", bad);
      bad.set("id", "bad");
      bad.set("type", "shape");
      bad.set("x", NaN);
      const alien = new Y.Map<unknown>();
      objects.set("alien", alien);
      alien.set("type", "hologram");
    }, "remote");
    warn.mockClear();
    expect(d.all().map((o) => o.id)).toEqual([good]);
    expect(d.get("bad")).toBeUndefined();
    d.all();
    d.all();
    const badWarnings = warn.mock.calls.filter((c: unknown[]) => String(c[0]).includes("bad"));
    expect(badWarnings).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(2); // one per invalid object, not per read
  });

  it("an entry that is not an object map at all (a string, a number, an array) is skipped, never dereferenced", () => {
    const d = new BoardDoc();
    const good = d.create(shape());
    const kid = d.create(shape({ parentId: null }));
    const objects = d.ydoc.getMap<unknown>("objects");
    d.ydoc.transact(() => {
      objects.set("str", "just a string");
      objects.set("num", 42);
      objects.set("arr", new Y.Array<unknown>());
      objects.set("nothing", null);
    }, "remote");
    expect(() => d.all()).not.toThrow();
    expect(d.all().map((o) => o.id).sort()).toEqual([good, kid].sort());
    for (const id of ["str", "num", "arr", "nothing"]) {
      expect(d.get(id)).toBeUndefined();
      expect(d.content(id)).toBeUndefined();
    }
    // Writing still works around them, including operations that scan every entry.
    expect(() => d.create(shape({ x: 5 }))).not.toThrow();
    expect(() => d.remove([good])).not.toThrow();
    expect(d.all()).toHaveLength(2);
    expect(() => d.update("str", { x: 1 })).not.toThrow();
  });

  it("an object repaired by a remote edit reappears", () => {
    const d = new BoardDoc();
    const objects = d.ydoc.getMap<Y.Map<unknown>>("objects");
    const id = d.create(shape());
    d.ydoc.transact(() => objects.get(id)!.set("x", NaN), "remote");
    expect(d.get(id)).toBeUndefined();
    d.ydoc.transact(() => objects.get(id)!.set("x", 7), "remote");
    expect(d.get(id)!.x).toBe(7);
  });
});

describe("BoardDoc groups", () => {
  it("group bounds are the union of its children, recomputed when they change", () => {
    const d = new BoardDoc();
    const g = d.create(group());
    const a = d.create(shape({ parentId: g, x: 0, y: 0, w: 100, h: 100 }));
    const b = d.create(shape({ parentId: g, x: 200, y: 50, w: 50, h: 50 }));
    expect(d.get(g)).toMatchObject({ x: 0, y: 0, w: 250, h: 100 });
    d.update(b, { x: 300 });
    expect(d.get(g)).toMatchObject({ x: 0, y: 0, w: 350, h: 100 });
    d.update(a, { w: 20, h: 20 });
    expect(d.get(g)).toMatchObject({ x: 0, y: 0, w: 350, h: 100 });
    d.remove([a]);
    expect(d.get(g)).toMatchObject({ x: 300, y: 50, w: 50, h: 50 });
  });

  it("uses the rotated bounds of children", () => {
    const d = new BoardDoc();
    const g = d.create(group());
    d.create(shape({ parentId: g, x: 100, y: 100, w: 100, h: 50, rotation: Math.PI / 2 }));
    const o = d.get(g)!;
    expect(o.x).toBeCloseTo(125, 9);
    expect(o.y).toBeCloseTo(75, 9);
    expect(o.w).toBeCloseTo(50, 9);
    expect(o.h).toBeCloseTo(100, 9);
  });

  it("reparenting a child updates both groups", () => {
    const d = new BoardDoc();
    const g1 = d.create(group());
    const g2 = d.create(group());
    const a = d.create(shape({ parentId: g1, x: 0, y: 0, w: 10, h: 10 }));
    d.create(shape({ parentId: g1, x: 50, y: 50, w: 10, h: 10 }));
    d.create(shape({ parentId: g2, x: 500, y: 500, w: 10, h: 10 }));
    d.update(a, { parentId: g2 });
    expect(d.get(g1)).toMatchObject({ x: 50, y: 50, w: 10, h: 10 });
    expect(d.get(g2)).toMatchObject({ x: 0, y: 0, w: 510, h: 510 });
  });

  it("nested groups propagate", () => {
    const d = new BoardDoc();
    const outer = d.create(group());
    const inner = d.create(group({ parentId: outer }));
    const leaf = d.create(shape({ parentId: inner, x: 10, y: 10, w: 10, h: 10 }));
    expect(d.get(outer)).toMatchObject({ x: 10, y: 10, w: 10, h: 10 });
    d.update(leaf, { x: 100 });
    expect(d.get(inner)).toMatchObject({ x: 100, y: 10 });
    expect(d.get(outer)).toMatchObject({ x: 100, y: 10 });
  });

  it("a group whose last child is removed is removed too", () => {
    const d = new BoardDoc();
    const g = d.create(group());
    const a = d.create(shape({ parentId: g }));
    d.remove([a]);
    expect(d.get(g)).toBeUndefined();
  });

  it("removing a group removes its children", () => {
    const d = new BoardDoc();
    const g = d.create(group());
    const a = d.create(shape({ parentId: g }));
    d.remove([g]);
    expect(d.get(a)).toBeUndefined();
  });

  it("group bounds changes undo together with the child change", () => {
    const d = new BoardDoc();
    const g = d.create(group());
    const a = d.create(shape({ parentId: g, x: 0, y: 0, w: 10, h: 10 }));
    d.stopCapturing();
    d.update(a, { x: 500 });
    expect(d.get(g)!.x).toBe(500);
    d.undo();
    expect(d.get(a)!.x).toBe(0);
    expect(d.get(g)!.x).toBe(0);
  });
});

describe("BoardDoc convergence", () => {
  function base() {
    const a = new BoardDoc();
    const ids = a.createMany([shape({ x: 0 }), shape({ x: 10 }), sticky(), shape({ x: 30 })]);
    const b = new BoardDoc();
    sync(a, b);
    return { a, b, ids };
  }

  function concurrentEdits(a: BoardDoc, b: BoardDoc, ids: string[]) {
    // concurrent create (both append at the same top), conflicting updates, and removes
    a.create(shape({ id: "from-a", x: 1 }));
    b.create(shape({ id: "from-b", x: 2 }));
    a.update(ids[0], { x: 111, y: 5 });
    b.update(ids[0], { x: 222, w: 77 });
    a.remove([ids[1]]);
    b.update(ids[1], { x: 333 }); // update vs delete
    a.update(ids[3], { opacity: 0.5 });
    b.remove([ids[2]]);
  }

  it("two docs exchanging updates in either order converge", () => {
    for (const order of ["a-first", "b-first"] as const) {
      const { a, b, ids } = base();
      concurrentEdits(a, b, ids);
      const ua = Y.encodeStateAsUpdate(a.ydoc);
      const ub = Y.encodeStateAsUpdate(b.ydoc);
      if (order === "a-first") {
        Y.applyUpdate(b.ydoc, ua, "remote");
        Y.applyUpdate(a.ydoc, ub, "remote");
      } else {
        Y.applyUpdate(a.ydoc, ub, "remote");
        Y.applyUpdate(b.ydoc, ua, "remote");
      }
      expect(snapshot(a)).toEqual(snapshot(b));
      const got = a.all().map((o) => o.id);
      expect(got).toContain("from-a");
      expect(got).toContain("from-b");
      expect(got).not.toContain(ids[1]);
      expect(got).not.toContain(ids[2]);
      expect(a.get(ids[3])!.opacity).toBe(0.5);
    }
  });

  it("the surviving set, order and non-conflicting values do not depend on exchange order", () => {
    const seed = new BoardDoc();
    const ids = seed.createMany([shape({ x: 0 }), shape({ x: 10 }), sticky(), shape({ x: 30 })]);
    const pair = () => {
      const a = new BoardDoc();
      const b = new BoardDoc();
      sync(seed, a);
      sync(seed, b);
      return { a, b };
    };
    const summary = (d: BoardDoc) => d.all().map((o) => ({ id: o.id, index: o.index, opacity: o.opacity }));

    const p1 = pair();
    concurrentEdits(p1.a, p1.b, ids);
    sync(p1.a, p1.b);
    sync(p1.b, p1.a);

    const p2 = pair();
    concurrentEdits(p2.a, p2.b, ids);
    sync(p2.b, p2.a);
    sync(p2.a, p2.b);

    expect(snapshot(p1.a)).toEqual(snapshot(p1.b));
    expect(snapshot(p2.a)).toEqual(snapshot(p2.b));
    expect(summary(p1.a)).toEqual(summary(p2.a));
  });

  it("concurrent appends with identical indexes keep a stable total order on both sides", () => {
    const { a, b } = base();
    const x = a.create(shape({ id: "zz" }));
    const y = b.create(shape({ id: "aa" }));
    expect(a.get(x)!.index).toBe(b.get(y)!.index);
    sync(a, b);
    sync(b, a);
    expect(a.all().map((o) => o.id)).toEqual(b.all().map((o) => o.id));
    const tail = a.all().slice(-2).map((o) => o.id);
    expect(tail).toEqual(["aa", "zz"]);
  });
});

describe("BoardDoc scale", () => {
  it("2,000 objects created in one transaction stay sorted and all() is fast", () => {
    const d = new BoardDoc();
    let ids: string[] = [];
    d.transact(() => {
      ids = d.createMany(Array.from({ length: 2000 }, (_, i) => shape({ x: i })));
    });
    const t0 = performance.now();
    const all = d.all();
    const ms = performance.now() - t0;
    expect(all).toHaveLength(2000);
    expect(all.map((o) => o.id)).toEqual(ids);
    for (let i = 1; i < all.length; i++) expect(all[i - 1].index < all[i].index).toBe(true);
    expect(ms).toBeLessThan(100);
  });

  it("all() is also fast on a document loaded cold from an update", () => {
    const src = new BoardDoc();
    src.createMany(Array.from({ length: 2000 }, (_, i) => shape({ x: i })));
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(src.ydoc));
    const d = new BoardDoc(ydoc);
    const t0 = performance.now();
    const all = d.all();
    const ms = performance.now() - t0;
    expect(all).toHaveLength(2000);
    expect(ms).toBeLessThan(500);
  });

  it("2,000 single create() calls in one transaction are not quadratic", () => {
    const d = new BoardDoc();
    const t0 = performance.now();
    d.transact(() => {
      for (let i = 0; i < 2000; i++) d.create(shape({ x: i }));
    });
    expect(performance.now() - t0).toBeLessThan(1500);
    expect(d.all()).toHaveLength(2000);
  });
});
