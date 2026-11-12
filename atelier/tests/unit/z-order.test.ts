import { describe, expect, it } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { dropObjects, reorderObjects } from "@/lib/engine/commands/z-order";
import { cameraToReveal } from "@/lib/engine/commands/focus";
import { fuzzyScore, fuzzyFilter } from "@/lib/engine/commands/fuzzy";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";

const shape = (id: string, extra: Partial<NewObject> = {}) => ({ ...defaultsFor("shape"), id, ...extra }) as NewObject;
const frame = (id: string) => ({ ...defaultsFor("frame"), id, w: 500, h: 500 }) as NewObject;

const make = (ids: string[]) => {
  const d = new BoardDoc();
  d.createMany(ids.map((i) => shape(i, { x: ids.indexOf(i) * 10 })));
  d.stopCapturing();
  return d;
};
const order = (d: BoardDoc, parent: string | null = null) => d.childrenOf(parent).map((o) => o.id);

describe("reorderObjects", () => {
  it("moves locked objects too when asked (the Layers panel can reorder them)", () => {
    const d = make(["a", "b", "c"]);
    d.update("a", { locked: true });
    reorderObjects(d, [d.get("a")!], "front");
    expect(order(d)).toEqual(["b", "c", "a"]);
  });
});

describe("dropObjects", () => {
  it("drops above and below a row, among its siblings", () => {
    const d = make(["a", "b", "c", "d"]);
    expect(dropObjects(d, ["a"], { relativeTo: "c", position: "above" })).toBe(true);
    expect(order(d)).toEqual(["b", "c", "a", "d"]);
    expect(dropObjects(d, ["d"], { relativeTo: "b", position: "below" })).toBe(true);
    expect(order(d)).toEqual(["d", "b", "c", "a"]);
  });

  it("moves several at once, keeping their relative z-order", () => {
    const d = make(["a", "b", "c", "d"]);
    dropObjects(d, ["b", "a"], { relativeTo: "d", position: "above" });
    expect(order(d)).toEqual(["c", "d", "a", "b"]);
  });

  it("drops into a frame as its top child and out of it again, keeping world positions", () => {
    const d = new BoardDoc();
    d.createMany([frame("f"), shape("a", { x: 40, y: 50 }), shape("k", { parentId: "f", x: 10, y: 10 })]);
    d.stopCapturing();
    expect(dropObjects(d, ["a"], { into: "f" })).toBe(true);
    expect(order(d, "f")).toEqual(["k", "a"]);
    expect(d.get("a")).toMatchObject({ parentId: "f", x: 40, y: 50 });
    expect(dropObjects(d, ["a"], { relativeTo: "f", position: "above" })).toBe(true);
    expect(d.get("a")!.parentId).toBeNull();
    expect(order(d)).toEqual(["f", "a"]);
  });

  it("refuses to drop an object into itself or its own descendant, and is one undo step", () => {
    const d = new BoardDoc();
    d.createMany([frame("f"), shape("k", { parentId: "f" }), shape("z")]);
    d.stopCapturing();
    expect(dropObjects(d, ["f"], { into: "f" })).toBe(false);
    expect(dropObjects(d, ["f"], { relativeTo: "k", position: "above" })).toBe(false);
    const steps = d.undoManager.undoStack.length;
    dropObjects(d, ["z"], { into: "f" });
    expect(d.undoManager.undoStack.length).toBe(steps + 1);
    d.undo();
    expect(d.get("z")!.parentId).toBeNull();
  });

  it("only moves the outermost of a selection (children travel with their frame)", () => {
    const d = new BoardDoc();
    d.createMany([frame("f"), shape("k", { parentId: "f" }), shape("z")]);
    d.stopCapturing();
    dropObjects(d, ["f", "k"], { relativeTo: "z", position: "above" });
    expect(order(d)).toEqual(["z", "f"]);
    expect(d.get("k")!.parentId).toBe("f");
  });
});

describe("fuzzy", () => {
  it("matches subsequences, case-insensitively, and rejects the rest", () => {
    expect(fuzzyScore("dup", "Duplicate")).not.toBeNull();
    expect(fuzzyScore("DUP", "duplicate")).not.toBeNull();
    expect(fuzzyScore("dpl", "Duplicate")).not.toBeNull();
    expect(fuzzyScore("xyz", "Duplicate")).toBeNull();
    expect(fuzzyScore("dup", "Distribute horizontally")).toBeNull();
    expect(fuzzyScore("", "anything")).toBe(0);
  });

  it("ranks prefixes and word starts above scattered matches", () => {
    const items = ["Send to back", "Duplicate", "Zoom to fit", "Bring to front"];
    expect(fuzzyFilter("dup", items, (s) => s)[0]).toBe("Duplicate");
    expect(fuzzyFilter("ztf", items, (s) => s)[0]).toBe("Zoom to fit");
    const r = fuzzyFilter("to", items, (s) => s);
    expect(r[0]).toBe("Zoom to fit"); // shorter, matches at a word start, beats the longer titles
  });

  it("requires every word of a multi-word query", () => {
    const items = ["Align left", "Align right", "Zoom in"];
    expect(fuzzyFilter("align r", items, (s) => s)).toEqual(["Align right", "Align left"].filter((s) => s === "Align right"));
    expect(fuzzyFilter("al lef", items, (s) => s)).toEqual(["Align left"]);
  });
});

describe("cameraToReveal", () => {
  const vp = { w: 1000, h: 800 };
  it("returns null when the rect is already comfortably in view", () => {
    expect(cameraToReveal({ x: 0, y: 0, z: 1 }, vp, { x: 100, y: 100, w: 200, h: 100 })).toBeNull();
  });
  it("centres an off-screen rect at the current zoom", () => {
    const c = cameraToReveal({ x: 0, y: 0, z: 1 }, vp, { x: 3000, y: 2000, w: 200, h: 100 })!;
    expect(c.z).toBe(1);
    expect((3100 - c.x) * c.z).toBeCloseTo(500);
    expect((2050 - c.y) * c.z).toBeCloseTo(400);
  });
  it("zooms out when the rect does not fit, never in", () => {
    const c = cameraToReveal({ x: 0, y: 0, z: 1 }, vp, { x: 0, y: 0, w: 5000, h: 100 })!;
    expect(c.z).toBeLessThan(1);
    expect(cameraToReveal({ x: 0, y: 0, z: 0.1 }, vp, { x: 50000, y: 50000, w: 10, h: 10 })!.z).toBeCloseTo(0.1);
  });
});
