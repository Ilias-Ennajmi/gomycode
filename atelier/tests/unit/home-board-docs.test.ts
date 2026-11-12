import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { describe, expect, it } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { createLocalBoardDoc, deleteLocalBoardDoc, duplicateLocalBoardDoc } from "@/components/home/board-docs";

const dbName = (id: string) => `atelier-board-${id}`;

async function open(id: string) {
  const ydoc = new Y.Doc();
  const p = new IndexeddbPersistence(dbName(id), ydoc);
  await p.whenSynced;
  return { doc: new BoardDoc(ydoc), close: () => p.destroy() };
}

describe("board documents made from the home screen", () => {
  it("builds a template into the board's IndexedDB document, ready for its first sync", async () => {
    const { firstFrameName } = await createLocalBoardDoc("tpl-1", { title: "Pitch", templateId: "deck" });
    expect(firstFrameName).toBe("Slide 1");
    const { doc, close } = await open("tpl-1");
    expect(doc.meta.title).toBe("Pitch");
    expect(doc.all().filter((o) => o.type === "frame")).toHaveLength(5);
    await close();
  });

  it("a blank board has a title and no objects", async () => {
    const { firstFrameName } = await createLocalBoardDoc("tpl-2", { title: "Empty", templateId: "blank" });
    expect(firstFrameName).toBeNull();
    const { doc, close } = await open("tpl-2");
    expect(doc.meta.title).toBe("Empty");
    expect(doc.all()).toEqual([]);
    await close();
  });

  it("an unknown template falls back to blank instead of failing", async () => {
    await createLocalBoardDoc("tpl-3", { title: "Odd", templateId: "nope" });
    const { doc, close } = await open("tpl-3");
    expect(doc.all()).toEqual([]);
    await close();
  });

  it("duplicates by copying the source document's state into the new board before first open", async () => {
    await createLocalBoardDoc("src", { title: "Original", templateId: "brainstorm" });
    const result = await duplicateLocalBoardDoc("src", "copy", "Original copy");
    expect(result).toEqual({ ok: true, firstFrameName: null });
    const a = await open("src");
    const c = await open("copy");
    expect(c.doc.meta.title).toBe("Original copy");
    expect(a.doc.meta.title).toBe("Original");
    expect(c.doc.all().length).toBe(a.doc.all().length);
    expect(c.doc.all().length).toBeGreaterThan(8);
    // Independent from here on: editing the copy leaves the original alone.
    c.doc.remove([c.doc.all()[0].id]);
    expect(a.doc.all().length).toBeGreaterThan(c.doc.all().length);
    await a.close();
    await c.close();
  });

  it("reports when the source has no local copy on this device, and creates nothing", async () => {
    const result = await duplicateLocalBoardDoc("never-opened", "copy-2", "x");
    expect(result).toEqual({ ok: false, reason: "not-on-device" });
    const c = await open("copy-2");
    expect(c.doc.all()).toEqual([]);
    expect(c.doc.ydoc.getMap("meta").size).toBe(0);
    await c.close();
  });

  it("deleteLocalBoardDoc removes the stored document", async () => {
    await createLocalBoardDoc("gone", { title: "Bye", templateId: "deck" });
    await deleteLocalBoardDoc("gone");
    const { doc, close } = await open("gone");
    expect(doc.all()).toEqual([]);
    await close();
  });
});
