import { describe, expect, it } from "vitest";
import { MAX_DIFF_IDS, diffObjects, summariseDiff } from "@/lib/engine/rounds/diff";
import { defaultsFor } from "@/lib/engine/model/defaults";
import { validateObject } from "@/lib/engine/model/validate";
import type { CanvasObject } from "@/lib/engine/model/types";

let n = 0;
function make(type: "shape" | "frame" | "image" | "sticky", id: string, over: Record<string, unknown> = {}): CanvasObject {
  const o = validateObject({ ...defaultsFor(type), id, index: `a${String(++n).padStart(4, "0")}`, createdAt: 1, updatedAt: 1, ...over });
  if (!o) throw new Error("invalid fixture");
  return o;
}
const map = (...objs: CanvasObject[]) => new Map(objs.map((o) => [o.id, o]));

describe("diffObjects", () => {
  it("with no previous round everything is added", () => {
    const f = make("frame", "f1");
    const a = make("shape", "a", { parentId: "f1" });
    const d = diffObjects(null, map(f, a));
    expect(d.added).toEqual(["a", "f1"]);
    expect(d.removed).toEqual([]);
    expect(d.changed).toEqual([]);
    expect(d.truncated).toBe(false);
    expect(d.byFrame).toEqual({ f1: { added: 2, changed: 0, removed: 0 } }); // a frame counts under itself
  });

  it("a moved object is changed; an object whose only difference is updatedAt or index is not", () => {
    const f = make("frame", "f1");
    const a = make("shape", "a", { parentId: "f1" });
    const b = make("shape", "b", { parentId: "f1" });
    const prev = map(f, a, b);
    const next = map(f, { ...a, x: a.x + 50, updatedAt: 99 } as CanvasObject, { ...b, updatedAt: 500, index: "zzz" } as CanvasObject);
    const d = diffObjects(prev, next);
    expect(d.changed).toEqual(["a"]);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(d.byFrame).toEqual({ f1: { added: 0, changed: 1, removed: 0 } });
  });

  it("removed objects are attributed through the previous round's frame", () => {
    const f = make("frame", "f1");
    const a = make("shape", "a", { parentId: "f1" });
    const loose = make("shape", "loose");
    const d = diffObjects(map(f, a, loose), map(f));
    expect(d.removed).toEqual(["a", "loose"]);
    expect(d.byFrame).toEqual({ f1: { added: 0, changed: 0, removed: 1 }, _none: { added: 0, changed: 0, removed: 1 } });
  });

  it("walks parentId to the top-most frame, through groups and nested frames", () => {
    const outer = make("frame", "outer");
    const inner = make("frame", "inner", { parentId: "outer" });
    const deep = make("shape", "deep", { parentId: "inner" });
    const d = diffObjects(map(outer, inner), map(outer, inner, deep));
    expect(d.byFrame).toEqual({ outer: { added: 1, changed: 0, removed: 0 } });
  });

  it("survives a parent cycle and a dangling parent", () => {
    const a = make("shape", "a", { parentId: "b" });
    const b = make("shape", "b", { parentId: "a" });
    const orphan = make("shape", "orphan", { parentId: "ghost" });
    const d = diffObjects(null, map(a, b, orphan));
    expect(d.added).toEqual(["a", "b", "orphan"]);
    expect(d.byFrame._none.added).toBe(3);
  });

  it("a changed asset reference counts as a change", () => {
    const img = make("image", "i", { assetId: "11111111-1111-4111-8111-111111111111" });
    const swapped = { ...img, assetId: "22222222-2222-4222-8222-222222222222" } as CanvasObject;
    expect(diffObjects(map(img), map(swapped)).changed).toEqual(["i"]);
  });

  it("text edits count as changes when the caller supplies text fingerprints", () => {
    const s = make("sticky", "s");
    const prev = map(s);
    const same = diffObjects(prev, prev, { prev: new Map([["s", "x1"]]), next: new Map([["s", "x1"]]) });
    expect(same.changed).toEqual([]);
    const edited = diffObjects(prev, prev, { prev: new Map([["s", "x1"]]), next: new Map([["s", "x2"]]) });
    expect(edited.changed).toEqual(["s"]);
    // text appearing on an object that had none is a change too
    expect(diffObjects(prev, prev, { prev: new Map(), next: new Map([["s", "x2"]]) }).changed).toEqual(["s"]);
  });

  it("is deterministic: the same boards in any insertion order give the same diff", () => {
    const objs = Array.from({ length: 40 }, (_, i) => make("shape", `o${i}`));
    const forward = diffObjects(null, map(...objs));
    const backward = diffObjects(null, map(...[...objs].reverse()));
    expect(JSON.stringify(forward)).toBe(JSON.stringify(backward));
    expect(forward.added).toEqual([...forward.added].sort());
  });

  it("caps the id lists at 2,000 but keeps the counts exact", () => {
    const f = make("frame", "f1");
    const many = Array.from({ length: 3000 }, (_, i) => make("shape", `o${String(i).padStart(5, "0")}`, { parentId: "f1" }));
    const d = diffObjects(map(f), map(f, ...many));
    expect(MAX_DIFF_IDS).toBe(2000);
    expect(d.added).toHaveLength(2000);
    expect(d.truncated).toBe(true);
    expect(d.byFrame.f1.added).toBe(3000);
  });

  it("does not mutate its inputs", () => {
    const a = make("shape", "a");
    const prev = map(a);
    const next = map({ ...a, x: 5 } as CanvasObject);
    const before = JSON.stringify([...prev, ...next]);
    diffObjects(prev, next);
    expect(JSON.stringify([...prev, ...next])).toBe(before);
  });
});

describe("summariseDiff", () => {
  it("totals the counts, whatever the id lists hold", () => {
    const f = make("frame", "f1");
    const many = Array.from({ length: 2100 }, (_, i) => make("shape", `o${i}`, { parentId: "f1" }));
    const d = diffObjects(map(f), map(f, ...many));
    expect(summariseDiff(d)).toEqual({ added: 2100, changed: 0, removed: 0, total: 2100 });
  });
  it("is zero for an empty diff", () => {
    expect(summariseDiff(diffObjects(null, new Map()))).toEqual({ added: 0, changed: 0, removed: 0, total: 0 });
  });
});
