import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { SCHEMA_VERSION, migrateBoard } from "@/lib/engine/model/migrate";
import type { ImageObj } from "@/lib/engine/model/types";

/** A Phase 1 board: raw Yjs maps exactly as Phase 1 wrote them (no schemaVersion key, no v2 image fields). */
function phase1Doc(): { doc: BoardDoc; ids: { plain: string; cropped: string; pixel: string; sticky: string } } {
  const doc = new BoardDoc();
  const base = { x: 0, y: 0, w: 100, h: 80, rotation: 0, parentId: null, locked: false, opacity: 1, createdAt: 1, updatedAt: 1 };
  const objects = doc.ydoc.getMap<Y.Map<unknown>>("objects");
  const put = (id: string, index: string, props: Record<string, unknown>) => {
    const m = new Y.Map<unknown>();
    for (const [k, v] of Object.entries({ id, index, ...base, ...props })) m.set(k, v);
    objects.set(id, m);
  };
  doc.ydoc.transact(() => {
    put("plain", "a0", { type: "image", assetId: "a1", crop: null, flipX: false, flipY: false });
    put("cropped", "a1", { type: "image", assetId: "a2", crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.5 }, flipX: true, flipY: false });
    put("pixel", "a2", { type: "image", assetId: "a3", crop: { x: 40, y: 30, w: 500, h: 400 }, flipX: false, flipY: false });
    put("sticky", "a3", { type: "sticky", fill: "yellow", size: "M" });
  });
  return { doc, ids: { plain: "plain", cropped: "cropped", pixel: "pixel", sticky: "sticky" } };
}

describe("migrateBoard", () => {
  it("SCHEMA_VERSION is 2", () => {
    expect(SCHEMA_VERSION).toBe(2);
  });

  it("upgrades a Phase 1 board and every image still opens unchanged", () => {
    const { doc, ids } = phase1Doc();
    const before = new Map(doc.all().map((o) => [o.id, o]));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    migrateBoard(doc);
    expect(doc.meta.schemaVersion).toBe(2);
    expect(doc.all()).toHaveLength(4);

    const plain = doc.get(ids.plain) as ImageObj;
    expect(plain).toMatchObject({ assetId: "a1", crop: null, flipX: false, flipY: false, x: 0, w: 100, h: 80 });
    expect(plain.mask).toEqual({ kind: "rect", radius: 0 });
    expect(plain.grayscale).toBe(false);
    expect(plain.title).toBe("");
    expect(plain.provenance).toBeNull();

    const cropped = doc.get(ids.cropped) as ImageObj;
    expect(cropped.crop).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.5 });
    expect(cropped.flipX).toBe(true);

    // Pixel crop: the source size is unknown here, so the crop is dropped and the image shows whole.
    expect((doc.get(ids.pixel) as ImageObj).crop).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();

    // Nothing else about any object changed (compare with the pre-migration reads, ignoring the v2 fields).
    for (const [id, o] of before) {
      const after = doc.get(id)!;
      for (const k of ["x", "y", "w", "h", "rotation", "index", "parentId", "locked", "opacity", "createdAt", "updatedAt"] as const) {
        expect(after[k], `${id}.${k}`).toEqual(o[k]);
      }
    }
    expect(doc.get(ids.sticky)).toMatchObject({ type: "sticky", fill: "yellow", size: "M" });
  });

  it("writes the defaults into the document (not only into reads)", () => {
    const { doc } = phase1Doc();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    migrateBoard(doc);
    const m = doc.ydoc.getMap<Y.Map<unknown>>("objects").get("plain")!;
    expect(m.get("mask")).toEqual({ kind: "rect", radius: 0 });
    expect(m.get("grayscale")).toBe(false);
    expect(m.get("title")).toBe("");
    expect(m.get("provenance")).toBeNull();
    vi.restoreAllMocks();
  });

  it("is idempotent: a second run produces no Yjs update", () => {
    const { doc } = phase1Doc();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    migrateBoard(doc);
    const sv = Y.encodeStateVector(doc.ydoc);
    let updates = 0;
    doc.ydoc.on("update", () => updates++);
    migrateBoard(doc);
    expect(updates).toBe(0);
    expect(Y.encodeStateVector(doc.ydoc)).toEqual(sv);
    vi.restoreAllMocks();
  });

  it("an empty new board is just stamped, once", () => {
    const doc = new BoardDoc();
    migrateBoard(doc);
    expect(doc.meta.schemaVersion).toBe(2);
    let updates = 0;
    doc.ydoc.on("update", () => updates++);
    migrateBoard(doc);
    expect(updates).toBe(0);
  });

  it("is not an undo step", () => {
    const { doc } = phase1Doc();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    migrateBoard(doc);
    expect(doc.canUndo()).toBe(false);
    vi.restoreAllMocks();
  });

  it("does not overwrite v2 data already on an object", () => {
    const { doc } = phase1Doc();
    doc.ydoc.getMap<Y.Map<unknown>>("objects").get("plain")!.set("mask", { kind: "circle", radius: 0 });
    doc.ydoc.getMap<Y.Map<unknown>>("objects").get("plain")!.set("title", "Hero");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    migrateBoard(doc);
    const o = doc.get("plain") as ImageObj;
    expect(o.mask.kind).toBe("circle");
    expect(o.title).toBe("Hero");
    vi.restoreAllMocks();
  });

  it("a newer board (schemaVersion 3) opens read-through: no migration, no throw", () => {
    const { doc } = phase1Doc();
    doc.ydoc.getMap("meta").set("schemaVersion", 3);
    const sv = Y.encodeStateVector(doc.ydoc);
    expect(() => migrateBoard(doc)).not.toThrow();
    expect(Y.encodeStateVector(doc.ydoc)).toEqual(sv);
    expect(doc.meta.schemaVersion).toBe(3);
    expect(doc.all()).toHaveLength(4);
    // Unknown object types from a newer version are skipped, not fatal.
    const m = new Y.Map<unknown>();
    m.set("type", "hologram");
    doc.ydoc.getMap<Y.Map<unknown>>("objects").set("future", m);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(doc.all()).toHaveLength(4);
    vi.restoreAllMocks();
  });

  it("tolerates junk entries and non-object values in the objects map", () => {
    const doc = new BoardDoc();
    doc.ydoc.getMap("objects").set("str", "hello");
    doc.ydoc.getMap("objects").set("num", 5);
    const m = new Y.Map<unknown>();
    m.set("type", "image");
    doc.ydoc.getMap<Y.Map<unknown>>("objects").set("broken", m);
    expect(() => migrateBoard(doc)).not.toThrow();
    expect(doc.meta.schemaVersion).toBe(2);
  });

  it("two replicas that both migrate converge to the same state", () => {
    const { doc: a } = phase1Doc();
    const b = new BoardDoc();
    Y.applyUpdate(b.ydoc, Y.encodeStateAsUpdate(a.ydoc));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    migrateBoard(a);
    migrateBoard(b);
    Y.applyUpdate(a.ydoc, Y.encodeStateAsUpdate(b.ydoc));
    Y.applyUpdate(b.ydoc, Y.encodeStateAsUpdate(a.ydoc));
    expect(a.all()).toEqual(b.all());
    expect(a.meta.schemaVersion).toBe(2);
    vi.restoreAllMocks();
  });
});
