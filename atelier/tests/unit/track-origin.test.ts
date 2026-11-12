import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";
import { richTextToPlainLines } from "@/lib/engine/model/rich-text-html";

const EDITOR = Symbol("editor");

function setup() {
  const doc = new BoardDoc();
  const id = doc.create({ ...defaultsFor("sticky"), x: 0, y: 0 } as NewObject);
  doc.undoManager.clear(); // the creation is not part of what these tests undo
  const frag = doc.content(id)!;
  const type = (text: string, origin: unknown) =>
    doc.ydoc.transact(() => {
      const p = new Y.XmlElement("paragraph");
      const t = new Y.XmlText();
      t.insert(0, text);
      p.insert(0, [t]);
      frag.insert(frag.length, [p]);
    }, origin);
  return { doc, id, frag, type };
}

describe("BoardDoc.trackOrigin", () => {
  it("edits under an unknown origin are not on the undo stack", () => {
    const { doc, frag, type } = setup();
    type("typed", EDITOR);
    expect(doc.canUndo()).toBe(false);
    expect(richTextToPlainLines(frag)).toEqual(["typed"]);
  });

  it("once an origin is tracked its edits undo and redo like local edits", () => {
    const { doc, frag, type } = setup();
    doc.trackOrigin(EDITOR);
    type("typed", EDITOR);
    expect(doc.canUndo()).toBe(true);
    doc.undo();
    expect(richTextToPlainLines(frag)).toEqual([]);
    doc.redo();
    expect(richTextToPlainLines(frag)).toEqual(["typed"]);
  });

  it("edits of other origins (a remote peer) are never undone", () => {
    const { doc, frag, type } = setup();
    doc.trackOrigin(EDITOR);
    type("mine", EDITOR);
    doc.stopCapturing();
    type("theirs", "remote");
    doc.undo();
    expect(richTextToPlainLines(frag)).toEqual(["theirs"]);
    expect(doc.canUndo()).toBe(false);
  });

  it("the returned function stops tracking", () => {
    const { doc, type } = setup();
    const untrack = doc.trackOrigin(EDITOR);
    untrack();
    type("typed", EDITOR);
    expect(doc.canUndo()).toBe(false);
  });

  it("tracked edits and local edits share one stack, in order", () => {
    const { doc, id, frag, type } = setup();
    doc.trackOrigin(EDITOR);
    type("typed", EDITOR);
    doc.stopCapturing();
    doc.update(id, { x: 50 });
    doc.undo();
    expect(doc.get(id)!.x).toBe(0);
    expect(richTextToPlainLines(frag)).toEqual(["typed"]);
    doc.undo();
    expect(richTextToPlainLines(frag)).toEqual([]);
  });
});
