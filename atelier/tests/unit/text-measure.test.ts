import { describe, expect, it } from "vitest";
import { measureTextBox, measureTextHeight } from "@/lib/engine/model/text-measure";

const p = (text: string) => `<p>${text}</p>`;
const LINE = (font: number, lh: number) => font * lh;

describe("measureTextHeight", () => {
  it("one short line is one line high; an empty paragraph too", () => {
    expect(measureTextHeight(p("Hello"), 400, 20, 1.3)).toBeCloseTo(LINE(20, 1.3));
    expect(measureTextHeight("", 400, 20, 1.3)).toBeCloseTo(LINE(20, 1.3));
    expect(measureTextHeight("<p></p>", 400, 20, 1.3)).toBeCloseTo(LINE(20, 1.3));
  });

  it("wraps: longer text in a narrow box is taller, and a wider box needs fewer lines", () => {
    const text = "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor";
    const narrow = measureTextHeight(p(text), 120, 16, 1.3);
    const wide = measureTextHeight(p(text), 900, 16, 1.3);
    expect(narrow).toBeGreaterThan(wide);
    expect(wide).toBeCloseTo(LINE(16, 1.3));
    const longer = measureTextHeight(p(text + text + text), 120, 16, 1.3);
    expect(longer).toBeGreaterThan(narrow);
  });

  it("height is a whole number of lines", () => {
    const h = measureTextHeight(p("word ".repeat(60)), 150, 18, 1.3);
    const lines = h / LINE(18, 1.3);
    expect(lines).toBeCloseTo(Math.round(lines));
  });

  it("paragraphs, hard breaks and list items each start a new line", () => {
    const one = LINE(16, 1.3);
    expect(measureTextHeight(p("a") + p("b") + p("c"), 400, 16, 1.3)).toBeCloseTo(3 * one);
    expect(measureTextHeight("<p>a<br>b</p>", 400, 16, 1.3)).toBeCloseTo(2 * one);
    expect(measureTextHeight("<ul><li><p>a</p></li><li><p>b</p></li></ul>", 400, 16, 1.3)).toBeCloseTo(2 * one);
  });

  it("headings are taller than body text", () => {
    expect(measureTextHeight("<h1>Title</h1>", 400, 16, 1.3)).toBeGreaterThan(measureTextHeight(p("Title"), 400, 16, 1.3));
    expect(measureTextHeight("<h3>Title</h3>", 400, 16, 1.3)).toBeLessThan(measureTextHeight("<h1>Title</h1>", 400, 16, 1.3));
  });

  it("scales with the font size and the line height", () => {
    expect(measureTextHeight(p("Hello"), 400, 40, 1.3)).toBeCloseTo(2 * measureTextHeight(p("Hello"), 400, 20, 1.3));
    expect(measureTextHeight(p("Hello"), 400, 20, 2)).toBeCloseTo((2 / 1.3) * measureTextHeight(p("Hello"), 400, 20, 1.3));
  });

  it("counts entities as one character and ignores markup", () => {
    const plain = measureTextHeight(p("a &amp; b"), 60, 16, 1.3);
    const marked = measureTextHeight("<p><strong>a</strong> &amp; <em>b</em></p>", 60, 16, 1.3);
    expect(marked).toBeCloseTo(plain);
  });

  it("never returns NaN or a height below one line, whatever the width", () => {
    for (const w of [0, -5, 1, Number.NaN, 1e9, Infinity]) {
      const h = measureTextHeight(p("some text here"), w, 16, 1.3);
      expect(Number.isFinite(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(LINE(16, 1.3) - 1e-9);
    }
  });

  it("is bounded for very long text", () => {
    const h = measureTextHeight(p("x".repeat(200_000)), 200, 16, 1.3);
    expect(Number.isFinite(h)).toBe(true);
  });
});

describe("measureTextBox", () => {
  it("without a width the box is as wide as the longest line and does not wrap", () => {
    const short = measureTextBox(p("Hi"), { fontSize: 24, lineHeight: 1.3 });
    const long = measureTextBox(p("Hello there, this is a long line"), { fontSize: 24, lineHeight: 1.3 });
    expect(long.w).toBeGreaterThan(short.w);
    expect(long.h).toBeCloseTo(short.h);
    const two = measureTextBox("<p>Hi</p><p>Hello there, this is a long line</p>", { fontSize: 24, lineHeight: 1.3 });
    expect(two.w).toBeCloseTo(long.w);
    expect(two.h).toBeCloseTo(2 * short.h);
  });

  it("with a width it reports that width", () => {
    expect(measureTextBox(p("Hi"), { fontSize: 24, lineHeight: 1.3, width: 300 }).w).toBe(300);
  });
});
