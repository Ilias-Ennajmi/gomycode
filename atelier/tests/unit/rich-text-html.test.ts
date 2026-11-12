import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { richTextToHtml, richTextToPlainLines } from "@/lib/engine/model/rich-text-html";

function frag(): Y.XmlFragment {
  return new Y.Doc().getXmlFragment("content");
}

function el(name: string, attrs: Record<string, string> = {}): Y.XmlElement {
  const e = new Y.XmlElement(name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function textNode(parent: Y.XmlElement, runs: Array<[string, Record<string, unknown>?]>) {
  const t = new Y.XmlText();
  parent.insert(parent.length, [t]);
  let at = 0;
  let prev: Record<string, unknown> = {};
  for (const [s, attrs = {}] of runs) {
    // Yjs inherits the formatting at the insert position, so clear what the previous run set.
    const cleared = Object.fromEntries(Object.keys(prev).map((k) => [k, null]));
    t.insert(at, s, { ...cleared, ...attrs });
    prev = attrs;
    at += s.length;
  }
}

function paragraph(f: Y.XmlFragment, runs: Array<[string, Record<string, unknown>?]>, attrs = {}): Y.XmlElement {
  const p = el("paragraph", attrs);
  f.insert(f.length, [p]);
  textNode(p, runs);
  return p;
}

describe("richTextToHtml", () => {
  it("renders paragraphs, marks and nests them in a stable order", () => {
    const f = frag();
    paragraph(f, [["plain "], ["bold", { bold: {} }], [" "], ["both", { bold: {}, italic: {} }]]);
    paragraph(f, [["u", { underline: {} }], ["s", { strike: {} }]]);
    const html = richTextToHtml(f);
    expect(html).toContain("<p>plain <strong>bold</strong> <strong><em>both</em></strong></p>");
    expect(html).toContain("<p><u>u</u><s>s</s></p>");
  });

  it("renders headings 1-3 (clamped) and bullet / ordered lists", () => {
    const f = frag();
    const h = el("heading", { level: "2" });
    f.insert(0, [h]);
    textNode(h, [["Title"]]);
    const h9 = el("heading", { level: "9" });
    f.insert(f.length, [h9]);
    textNode(h9, [["Big"]]);
    const ul = el("bulletList");
    f.insert(f.length, [ul]);
    for (const s of ["one", "two"]) {
      const li = el("listItem");
      ul.insert(ul.length, [li]);
      const p = el("paragraph");
      li.insert(0, [p]);
      textNode(p, [[s]]);
    }
    const ol = el("orderedList");
    f.insert(f.length, [ol]);
    const li = el("listItem");
    ol.insert(0, [li]);
    const p = el("paragraph");
    li.insert(0, [p]);
    textNode(p, [["first"]]);
    const html = richTextToHtml(f);
    expect(html).toContain("<h2>Title</h2>");
    expect(html).toContain("<h3>Big</h3>");
    expect(html).toContain("<ul><li><p>one</p></li><li><p>two</p></li></ul>");
    expect(html).toContain("<ol><li><p>first</p></li></ol>");
  });

  it("escapes markup in text so <script> never reaches the DOM", () => {
    const f = frag();
    paragraph(f, [['<script>alert("x")</script> & <img src=x onerror=1>']]);
    const html = richTextToHtml(f);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });

  it("keeps http(s) and mailto links with rel=noopener and drops javascript:, data: and vbscript: links", () => {
    const f = frag();
    paragraph(f, [
      ["ok", { link: { href: "https://example.com/a?b=1&c=2" } }],
      [" mail", { link: { href: "mailto:a@b.co" } }],
      [" bad", { link: { href: "javascript:alert(1)" } }],
      [" tricky", { link: { href: " JaVa\tScRiPt:alert(1)" } }],
      [" data", { link: { href: "data:text/html,<script>1</script>" } }],
    ]);
    const html = richTextToHtml(f);
    expect(html).toContain('<a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">ok</a>');
    expect(html).toContain('href="mailto:a@b.co"');
    expect(html.toLowerCase()).not.toContain("javascript:");
    expect(html.toLowerCase()).not.toContain("data:text");
    expect(html).toContain("bad"); // the text survives, only the link goes
    expect(html).toContain("tricky");
  });

  it("supports the font-size text-style mark within 8..400 px and ignores unknown marks", () => {
    const f = frag();
    paragraph(f, [
      ["big", { textStyle: { fontSize: "48px" } }],
      ["x", { textStyle: { fontSize: "99999px" } }],
      ["y", { code: {}, highlight: {} }],
    ]);
    const html = richTextToHtml(f);
    expect(html).toContain('<span style="font-size:48px">big</span>');
    expect(html).not.toContain("99999");
    expect(html).toContain("y");
  });

  it("keeps only whitelisted text-align on paragraphs and renders hard breaks", () => {
    const f = frag();
    const p = paragraph(f, [["a"]], { textAlign: "center" });
    p.insert(p.length, [el("hardBreak")]);
    paragraph(f, [["b"]], { textAlign: "expression(evil)" });
    const html = richTextToHtml(f);
    expect(html).toContain('<p style="text-align:center">a<br></p>');
    expect(html).toContain("<p>b</p>");
  });

  it("renders a lineHeight attribute (0.8..3 only) next to text-align", () => {
    const f = frag();
    paragraph(f, [["a"]], { lineHeight: 1.8 });
    paragraph(f, [["b"]], { textAlign: "right", lineHeight: 2 });
    paragraph(f, [["c"]], { lineHeight: 40 });
    paragraph(f, [["d"]], { lineHeight: "url(evil)" });
    const html = richTextToHtml(f);
    expect(html).toContain('<p style="line-height:1.8">a</p>');
    expect(html).toContain('<p style="text-align:right;line-height:2">b</p>');
    expect(html).toContain("<p>c</p>");
    expect(html).toContain("<p>d</p>");
  });

  it("an empty fragment is the empty string and unknown nodes degrade to their children", () => {
    expect(richTextToHtml(frag())).toBe("");
    const f = frag();
    const odd = el("mysteryNode");
    f.insert(0, [odd]);
    textNode(odd, [["kept"]]);
    expect(richTextToHtml(f)).toContain("kept");
    expect(richTextToHtml(f)).not.toContain("mysteryNode");
  });
});

describe("richTextToPlainLines", () => {
  it("returns one string per block", () => {
    const f = frag();
    paragraph(f, [["hello ", {}], ["world", { bold: {} }]]);
    paragraph(f, [["second"]]);
    expect(richTextToPlainLines(f)).toEqual(["hello world", "second"]);
  });
});
