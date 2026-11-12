import { describe, expect, it } from "vitest";
import { writeRichContent, richContentToJSON, type RichJSON } from "@/lib/engine/clipboard/rich";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import { objectText, replaceAll, searchBoard } from "@/lib/engine/model/search";
import type { NewObject } from "@/lib/engine/model/types";

const O = { caseSensitive: false, wholeWord: false };

function para(text: string, marks?: { type: string }[]): RichJSON {
  return { type: "paragraph", content: [{ type: "text", text, ...(marks ? { marks } : {}) }] };
}

function board() {
  const doc = new BoardDoc();
  doc.createMany([
    { ...defaultsFor("sticky"), id: "s1" } as NewObject,
    { ...defaultsFor("sticky"), id: "s2" } as NewObject,
    { ...defaultsFor("shape"), id: "sh" } as NewObject,
    { ...defaultsFor("text"), id: "t" } as NewObject,
    { ...defaultsFor("frame"), id: "f", name: "Hero Cat frame" } as NewObject,
    { ...defaultsFor("arrow"), id: "a", label: "cat to dog" } as NewObject,
    { ...defaultsFor("image"), id: "i", assetId: "x" } as NewObject,
  ]);
  const set = (id: string, ...paras: RichJSON[]) => doc.transact(() => writeRichContent(doc.content(id)!, { type: "doc", content: paras }));
  set("s1", para("The cat sat on the mat"), para("Concatenate cats"));
  set("s2", para("Dog and DOG and dog"));
  set("sh", para("Cat label"));
  set("t", para("nothing here"));
  doc.stopCapturing();
  return { doc, set };
}

describe("objectText", () => {
  it("joins paragraphs of a sticky and reads frame names and arrow labels", () => {
    const { doc } = board();
    expect(objectText(doc, "s1")).toBe("The cat sat on the mat\nConcatenate cats");
    expect(objectText(doc, "f")).toBe("Hero Cat frame");
    expect(objectText(doc, "a")).toBe("cat to dog");
    expect(objectText(doc, "i")).toBe("");
    expect(objectText(doc, "missing")).toBe("");
  });
});

describe("searchBoard", () => {
  it("finds text in stickies, shape labels, frame names and arrow labels, with match counts", () => {
    const { doc } = board();
    const hits = searchBoard(doc, "cat", O);
    const by = Object.fromEntries(hits.map((h) => [h.id, h]));
    expect(by.s1).toEqual({ id: "s1", field: "text", matches: 3 }); // cat, Concatenate, cats
    expect(by.sh).toEqual({ id: "sh", field: "label", matches: 1 });
    expect(by.f).toEqual({ id: "f", field: "frameName", matches: 1 });
    expect(by.a).toEqual({ id: "a", field: "label", matches: 1 });
    expect(by.s2).toBeUndefined();
    expect(by.t).toBeUndefined();
  });

  it("respects case sensitivity", () => {
    const { doc } = board();
    expect(searchBoard(doc, "DOG", { caseSensitive: true, wholeWord: false }).find((h) => h.id === "s2")?.matches).toBe(1);
    expect(searchBoard(doc, "DOG", O).find((h) => h.id === "s2")?.matches).toBe(3);
    expect(searchBoard(doc, "Cat", { caseSensitive: true, wholeWord: false }).map((h) => h.id).sort()).toEqual(["f", "sh"]);
  });

  it("respects whole-word matching", () => {
    const { doc } = board();
    const hits = searchBoard(doc, "cat", { caseSensitive: false, wholeWord: true });
    expect(hits.find((h) => h.id === "s1")?.matches).toBe(1);
    expect(hits.find((h) => h.id === "sh")?.matches).toBe(1);
  });

  it("treats the query literally (no regex) and ignores empty queries", () => {
    const { doc, set } = board();
    set("t", para("price (a+b)* [x] $1.50"));
    expect(searchBoard(doc, "(a+b)*", O).map((h) => h.id)).toEqual(["t"]);
    expect(searchBoard(doc, "$1.50", O)).toHaveLength(1);
    expect(searchBoard(doc, ".", O).map((h) => h.id)).toEqual(["t"]); // only the literal dot
    expect(searchBoard(doc, "", O)).toEqual([]);
    expect(searchBoard(doc, "   ", O)).toEqual([]);
  });

  it("returns hits in z-order", () => {
    const { doc } = board();
    const ids = searchBoard(doc, "cat", O).map((h) => h.id);
    expect(ids).toEqual(["s1", "sh", "f", "a"]);
  });
});

describe("replaceAll", () => {
  it("replaces everywhere, returns the count, and is one undo step", () => {
    const { doc } = board();
    const before = doc.undoManager.undoStack.length;
    const n = replaceAll(doc, "cat", "owl", O);
    expect(n).toBe(3 + 1 + 1 + 1);
    expect(objectText(doc, "s1")).toBe("The owl sat on the mat\nConowlenate owls");
    expect(objectText(doc, "sh")).toBe("owl label");
    expect(objectText(doc, "f")).toBe("Hero owl frame");
    expect(objectText(doc, "a")).toBe("owl to dog");
    expect(doc.undoManager.undoStack.length).toBe(before + 1);
    doc.undo();
    expect(objectText(doc, "s1")).toBe("The cat sat on the mat\nConcatenate cats");
    expect(objectText(doc, "f")).toBe("Hero Cat frame");
    expect(objectText(doc, "a")).toBe("cat to dog");
    expect(searchBoard(doc, "owl", O)).toEqual([]);
  });

  it("keeps formatting of the replaced text and the text around it", () => {
    const { doc, set } = board();
    set("t", { type: "paragraph", content: [{ type: "text", text: "a " }, { type: "text", text: "bold", marks: [{ type: "bold" }] }, { type: "text", text: " word" }] });
    expect(replaceAll(doc, "bold", "strong", O)).toBe(1);
    const json = richContentToJSON(doc.content("t")!);
    const runs = (json.content?.[0].content ?? []).map((n) => ({ text: n.text, bold: !!n.marks?.some((m) => m.type === "bold") }));
    expect(runs).toEqual([
      { text: "a ", bold: false },
      { text: "strong", bold: true },
      { text: " word", bold: false },
    ]);
  });

  it("uses the replacement literally and handles whole words, case and empty replacements", () => {
    const { doc } = board();
    expect(replaceAll(doc, "dog", "$& $1", { caseSensitive: false, wholeWord: true })).toBe(4);
    expect(objectText(doc, "s2")).toBe("$& $1 and $& $1 and $& $1");
    expect(replaceAll(doc, "Concat", "", { caseSensitive: true, wholeWord: false })).toBe(1);
    expect(objectText(doc, "s1")).toContain("\nenate cats");
  });

  it("returns 0 without touching the document when nothing matches", () => {
    const { doc } = board();
    const before = doc.undoManager.undoStack.length;
    expect(replaceAll(doc, "zebra", "x", O)).toBe(0);
    expect(replaceAll(doc, "", "x", O)).toBe(0);
    expect(doc.undoManager.undoStack.length).toBe(before);
  });

  it("skips locked objects", () => {
    const { doc } = board();
    doc.update("s2", { locked: true });
    doc.stopCapturing();
    expect(replaceAll(doc, "dog", "fox", O)).toBe(1); // only the arrow label
    expect(objectText(doc, "s2")).toBe("Dog and DOG and dog");
  });
});
