import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  blocksToMarkdown,
  blocksToPlainText,
  fragmentToBlocks,
  layoutBlocks,
  type RichBlock,
  type TextMeasurer,
} from "@/lib/engine/export/text-layout";

const measure: TextMeasurer = (text, font) => text.length * font.size * 0.5;
const base = { fontSize: 20, lineHeight: 1.3, align: "left" as const, family: "Inter", measure };
const p = (text: string, extra: Partial<RichBlock> = {}): RichBlock => ({ kind: "p", runs: [{ text, marks: [] }], ...extra });

describe("layoutBlocks", () => {
  it("wraps a 40-char paragraph in a 100 px box at size 20 into lines no wider than the box", () => {
    const text = "alpha beta gamma delta epsilon zeta eta"; // 39 chars
    const { lines, height } = layoutBlocks([p(text)], { ...base, width: 100 });
    // 10 px per char: 10 chars per line
    expect(lines.length).toBeGreaterThanOrEqual(4);
    for (const l of lines) expect(l.width).toBeLessThanOrEqual(100 + 1e-6);
    expect(lines.map((l) => l.runs.map((r) => r.text).join("")).join(" ").replace(/\s+/g, " ").trim()).toBe(text);
    expect(height).toBeCloseTo(lines.length * 20 * 1.3, 6);
  });

  it("breaks a single overlong word by character", () => {
    const { lines } = layoutBlocks([p("abcdefghijklmnopqrstuvwxyz")], { ...base, width: 100 });
    expect(lines.length).toBe(3); // 10 + 10 + 6
    expect(lines[0].width).toBeLessThanOrEqual(100);
    expect(lines.flatMap((l) => l.runs.map((r) => r.text)).join("")).toBe("abcdefghijklmnopqrstuvwxyz");
  });

  it("never wraps when width is null", () => {
    const { lines } = layoutBlocks([p("a ".repeat(100).trim())], { ...base, width: null });
    expect(lines).toHaveLength(1);
    expect(lines[0].width).toBeGreaterThan(1000);
  });

  it("centres a line by half the free space and right-aligns by all of it", () => {
    const centre = layoutBlocks([p("abcde")], { ...base, width: 200, align: "center" }); // 50 px wide
    expect(centre.lines[0].x).toBeCloseTo(75, 6);
    const right = layoutBlocks([p("abcde")], { ...base, width: 200, align: "right" });
    expect(right.lines[0].x).toBeCloseTo(150, 6);
    const own = layoutBlocks([p("abcde", { align: "right" })], { ...base, width: 200 });
    expect(own.lines[0].x).toBeCloseTo(150, 6);
  });

  it("numbers ordered lists 1. 2. and bullets unordered ones, indented 1.5 x size", () => {
    const li = (t: string, n: number): RichBlock => ({ kind: "li", listType: "ordered", index: n, runs: [{ text: t, marks: [] }] });
    const { lines } = layoutBlocks([li("one", 1), li("two", 2), { kind: "li", listType: "bullet", runs: [{ text: "dot", marks: [] }] }], { ...base, width: 300 });
    const text = (i: number) => lines[i].runs.map((r) => r.text).join("");
    expect(text(0)).toContain("1.");
    expect(text(1)).toContain("2.");
    expect(text(2)).toContain("•");
    // the item text starts at 30 px (1.5 x 20); the marker sits before it
    const textRun = lines[0].runs.find((r) => r.text === "one")!;
    expect(textRun.x).toBeCloseTo(30, 6);
  });

  it("sets headings bigger and bold", () => {
    const body = layoutBlocks([p("Title")], { ...base, width: 300 });
    const h = layoutBlocks([{ kind: "h1", runs: [{ text: "Title", marks: [] }] }], { ...base, width: 300 });
    expect(h.height).toBeGreaterThan(body.height);
    expect(h.lines[0].runs[0].font.size).toBeGreaterThan(20);
    expect(h.lines[0].runs[0].font.weight).toBeGreaterThanOrEqual(600);
    const h3 = layoutBlocks([{ kind: "h3", runs: [{ text: "T", marks: [] }] }], { ...base, width: 300 });
    expect(h3.lines[0].runs[0].font.size).toBeLessThan(h.lines[0].runs[0].font.size);
  });

  it("gives an empty block the height of a blank line", () => {
    const { lines, height } = layoutBlocks([p(""), p("x")], { ...base, width: 200 });
    expect(lines.length).toBe(2);
    expect(height).toBeCloseTo(2 * 20 * 1.3, 6);
    expect(lines[0].runs.map((r) => r.text).join("")).toBe("");
  });

  it("puts the baseline inside the line box and advances by the line height", () => {
    const { lines } = layoutBlocks([p("a"), p("b")], { ...base, width: 200 });
    expect(lines[0].y).toBeGreaterThan(0);
    expect(lines[0].y).toBeLessThan(20 * 1.3);
    expect(lines[1].y - lines[0].y).toBeCloseTo(26, 6);
  });

  it("honours marks (bold weight, italic) and a per-run size", () => {
    const b: RichBlock = { kind: "p", runs: [{ text: "x", marks: ["bold", "italic"] }, { text: "y", marks: [], size: 40 }] };
    const { lines } = layoutBlocks([b], { ...base, width: null });
    expect(lines[0].runs[0].font).toMatchObject({ weight: 700, italic: true, size: 20 });
    expect(lines[0].runs[1].font.size).toBe(40);
    // taller run makes the line taller
    expect(lines[0].y).toBeGreaterThan(20);
  });

  it("splits on newline runs (hard breaks)", () => {
    const { lines } = layoutBlocks([p("one\ntwo")], { ...base, width: 400 });
    expect(lines).toHaveLength(2);
  });

  it("terminates and stays finite for a hostile zero or negative width", () => {
    const { lines, height } = layoutBlocks([p("hello world")], { ...base, width: 0 });
    expect(Number.isFinite(height)).toBe(true);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThan(100);
  });
});

function el(name: string, attrs: Record<string, string> = {}): Y.XmlElement {
  const e = new Y.XmlElement(name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}
function fill(parent: Y.XmlElement, runs: Array<[string, Record<string, unknown>?]>) {
  const t = new Y.XmlText();
  parent.insert(parent.length, [t]);
  let at = 0;
  let prev: Record<string, unknown> = {};
  for (const [s, attrs = {}] of runs) {
    const cleared = Object.fromEntries(Object.keys(prev).map((k) => [k, null]));
    t.insert(at, s, { ...cleared, ...attrs });
    prev = attrs;
    at += s.length;
  }
}
function fragment(): Y.XmlFragment {
  return new Y.Doc().getXmlFragment("c");
}

describe("fragmentToBlocks", () => {
  it("maps bold, italic, underline, strike and link marks and drops javascript: hrefs", () => {
    const f = fragment();
    const para = el("paragraph");
    f.insert(0, [para]);
    fill(para, [
      ["a", { bold: {} }],
      ["b", { italic: {}, underline: {} }],
      ["c", { strike: {} }],
      ["d", { link: { href: "https://example.com/x" } }],
      ["e", { link: { href: "javascript:alert(1)" } }],
      ["f", { textStyle: { fontSize: "32px" } }],
    ]);
    const [b] = fragmentToBlocks(f);
    expect(b.kind).toBe("p");
    const byText = Object.fromEntries(b.runs.map((r) => [r.text, r]));
    expect(byText.a.marks).toEqual(["bold"]);
    expect(byText.b.marks.sort()).toEqual(["italic", "underline"]);
    expect(byText.c.marks).toEqual(["strike"]);
    expect(byText.d.href).toBe("https://example.com/x");
    expect(byText.e.href).toBeUndefined();
    expect(byText.f.size).toBe(32);
  });

  it("reads headings, alignment, lists and hard breaks", () => {
    const f = fragment();
    const h = el("heading", { level: "2", textAlign: "center" });
    f.insert(0, [h]);
    fill(h, [["Head"]]);
    const ol = el("orderedList");
    f.insert(1, [ol]);
    for (const s of ["x", "y"]) {
      const li = el("listItem");
      ol.insert(ol.length, [li]);
      const para = el("paragraph");
      li.insert(0, [para]);
      fill(para, [[s]]);
    }
    const para = el("paragraph");
    f.insert(2, [para]);
    const t = new Y.XmlText();
    para.insert(0, [t]);
    t.insert(0, "a");
    para.insert(1, [el("hardBreak")]);
    const t2 = new Y.XmlText();
    para.insert(2, [t2]);
    t2.insert(0, "b");
    const blocks = fragmentToBlocks(f);
    expect(blocks[0]).toMatchObject({ kind: "h2", align: "center" });
    expect(blocks[1]).toMatchObject({ kind: "li", listType: "ordered", index: 1 });
    expect(blocks[2]).toMatchObject({ kind: "li", listType: "ordered", index: 2 });
    expect(blocksToPlainText(blocks)).toBe("Head\nx\ny\na\nb");
  });

  it("returns no blocks for an empty fragment", () => {
    expect(fragmentToBlocks(fragment())).toEqual([]);
  });
});

describe("blocksToMarkdown", () => {
  it("writes bold and a link as markdown, headings and lists", () => {
    const blocks: RichBlock[] = [
      { kind: "h1", runs: [{ text: "T", marks: [] }] },
      { kind: "p", runs: [{ text: "hi", marks: ["bold"] }, { text: " ", marks: [] }, { text: "site", marks: [], href: "https://example.com" }] },
      { kind: "li", listType: "bullet", runs: [{ text: "pt", marks: ["italic"] }] },
      { kind: "li", listType: "ordered", index: 3, runs: [{ text: "n", marks: ["strike"] }] },
    ];
    const md = blocksToMarkdown(blocks);
    expect(md).toContain("# T");
    expect(md).toContain("**hi**");
    expect(md).toContain("[site](https://example.com)");
    expect(md).toContain("- *pt*");
    expect(md).toContain("3. ~~n~~");
  });
});
