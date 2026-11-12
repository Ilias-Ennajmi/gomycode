import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { writeRichContent } from "@/lib/engine/clipboard/rich";
import { woffToTtf, bundledFont } from "@/lib/engine/export/fonts";
import { buildPdf, framePageSize, imageTargetPx, type PdfFontSource, type PdfOptions } from "@/lib/engine/export/pdf";
import { mixPalettes } from "@/lib/engine/export/pdf-plan";
import { boardDocSource } from "@/lib/engine/export/scene";
import type { ImageProvider } from "@/lib/engine/export/raster";
import { defaultsFor, framePresetPx } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";
import { fakeBitmap, fakeCanvasFactory, recordingContext } from "./helpers/fake-canvas";
import { tinyJpeg } from "./helpers/tiny-jpeg";

const ASSET = "11111111-1111-4111-8111-111111111111";
const measure = (t: string, f: { size: number }) => t.length * f.size * 0.5;
const fonts: PdfFontSource = {
  async ttf(font) {
    const b = bundledFont(font);
    if (!b) return null;
    const bytes = woffToTtf(new Uint8Array(readFileSync(join(process.cwd(), "public/fonts/export", b.file))));
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  },
};
const noFonts: PdfFontSource = { ttf: async () => null };
const OPTS: PdfOptions = { quality: "screen", cover: null, palettePage: false, creditsPage: false, frameIds: null, compress: false };

function deps(over: Record<string, unknown> = {}) {
  const { ctx } = recordingContext({ opaque: true });
  const progress: number[] = [];
  return {
    progress,
    d: {
      images: { load: async () => fakeBitmap(400, 300) } as ImageProvider,
      signal: new AbortController().signal,
      onProgress: (r: number) => progress.push(r),
      canvasFactory: fakeCanvasFactory(ctx, undefined, tinyJpeg()),
      fonts,
      measure,
      ...over,
    },
  };
}

function frame(doc: BoardDoc, name: string, order: string, extra: Record<string, unknown> = {}): string {
  return doc.create({ ...defaultsFor("frame"), name, order, ...extra } as unknown as NewObject);
}
function textIn(doc: BoardDoc, parent: string, s: string, x = 50, y = 50): string {
  const id = doc.create({ ...defaultsFor("text"), x, y, w: 400, h: 40, parentId: parent, autoWidth: false } as unknown as NewObject);
  doc.transact(() => writeRichContent(doc.content(id)!, { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: s }] }] }));
  return id;
}
const text = async (blob: Blob) => new TextDecoder("latin1").decode(await blob.arrayBuffer());
const pages = (pdf: string) => (pdf.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;

describe("framePageSize and imageTargetPx", () => {
  it("uses the real size for paper presets and 0.75 pt per pixel otherwise", () => {
    const a4 = framePageSize({ preset: "a4", ...framePresetPx("a4", 96) });
    expect(a4.wPt).toBeCloseTo(595.28, 1);
    expect(a4.hPt).toBeCloseTo(841.89, 1);
    expect(framePageSize({ preset: "slide-16-9", w: 1920, h: 1080 })).toEqual({ wPt: 1440, hPt: 810 });
    expect(framePageSize({ preset: "letter", ...framePresetPx("letter", 96) })).toEqual({ wPt: 612, hPt: 792 });
    // an A4 frame stretched to another shape is a custom size
    expect(framePageSize({ preset: "a4", w: 1000, h: 500 })).toEqual({ wPt: 750, hPt: 375 });
  });
  it("never asks for more pixels than the original has", () => {
    expect(imageTargetPx(283.46, 300, 4000)).toBe(1181); // 100 mm at 300 dpi
    expect(imageTargetPx(283.46, 300, 800)).toBe(800);
    expect(imageTargetPx(0, 300, 800)).toBe(1);
  });
});

describe("buildPdf", () => {
  it("writes one page per frame in presentation order, with real text in an embedded font", async () => {
    const doc = new BoardDoc();
    const b = frame(doc, "B", "a1", { x: 0 });
    const a = frame(doc, "A", "a0", { x: 3000 });
    const c = frame(doc, "C", "a2", { x: 6000 });
    textIn(doc, b, "Second slide", 3050 - 3000);
    textIn(doc, a, "Direction A", 3050);
    textIn(doc, c, "Third", 6050);
    const t = deps();
    const r = await buildPdf(boardDocSource(doc), OPTS, t.d);
    const pdf = await text(r.blob);
    expect(r.pageCount).toBe(3);
    expect(pdf.startsWith("%PDF-")).toBe(true);
    expect(pages(pdf)).toBe(3);
    expect(pdf).toContain("/FontFile2");
    expect(pdf).toContain("Identity-H");
    expect((pdf.match(/<[0-9a-f]+>\s*Tj/gi) ?? []).length).toBeGreaterThan(0);
    expect(t.progress.at(-1)).toBe(1);
    // order: A (a0) is first, so a PDF whose first page holds "Direction A" has it before the others; check through the plain-text path below
  });

  it("leaves text as plain strings in the content stream when it can only use the standard font, in page order", async () => {
    const doc = new BoardDoc();
    const b = frame(doc, "B", "a1");
    const a = frame(doc, "A", "a0", { x: 3000 });
    textIn(doc, b, "Second slide", 50);
    textIn(doc, a, "Direction A", 3050);
    const r = await buildPdf(boardDocSource(doc), OPTS, deps({ fonts: noFonts }).d);
    const pdf = await text(r.blob);
    expect(pdf).toMatch(/\(Direction A\) Tj/);
    expect(pdf.indexOf("(Direction A)")).toBeLessThan(pdf.indexOf("(Second slide)"));
    expect(r.summary.warnings.join(" ")).toMatch(/standard PDF font/);
  });

  it("exports only the chosen frames", async () => {
    const doc = new BoardDoc();
    frame(doc, "A", "a0");
    const b = frame(doc, "B", "a1", { x: 3000 });
    const r = await buildPdf(boardDocSource(doc), { ...OPTS, frameIds: [b] }, deps().d);
    expect(r.pageCount).toBe(1);
  });

  it("adds a cover, a palette page and credits pages (40 rows a page)", async () => {
    const doc = new BoardDoc();
    frame(doc, "A", "a0");
    frame(doc, "B", "a1", { x: 3000 });
    doc.create({
      ...defaultsFor("palette"), x: 0, y: 2000, w: 400, h: 80,
      swatches: [{ hex: "#112233", weight: 0.6, name: "Ink", locked: false }, { hex: "#aabbcc", weight: 0.4, name: "Mist", locked: false }],
    } as unknown as NewObject);
    const credits = Array.from({ length: 95 }, (_, i) => ({ file: `pic-${i}`, source: "https://example.com/" + "x".repeat(200), credit: `Photographer ${i}`, licence: "CC BY", capturedAt: "2026-01-01" }));
    const r = await buildPdf(boardDocSource(doc), { ...OPTS, cover: { title: "Spring 2027", client: "Acme", date: "12 Nov 2026" }, palettePage: true, creditsPage: true }, deps({ extras: { credits } }).d);
    expect(r.pageCount).toBe(1 + 2 + 1 + 3);
    expect(pages(await text(r.blob))).toBe(7);
  });

  it("skips the palette and credits pages when there is nothing to show, and says so", async () => {
    const doc = new BoardDoc();
    frame(doc, "A", "a0");
    const r = await buildPdf(boardDocSource(doc), { ...OPTS, palettePage: true, creditsPage: true }, deps().d);
    expect(r.pageCount).toBe(1);
    expect(r.summary.warnings.join(" ")).toMatch(/No palette/);
    expect(r.summary.warnings.join(" ")).toMatch(/credit/);
  });

  it("downsamples pictures to the page's resolution and keeps a failed one as a placeholder", async () => {
    const doc = new BoardDoc();
    const f = frame(doc, "A", "a0");
    doc.create({ ...defaultsFor("image"), assetId: ASSET, x: 10, y: 10, w: 200, h: 100, parentId: f } as unknown as NewObject);
    doc.create({ ...defaultsFor("image"), assetId: "22222222-2222-4222-8222-222222222222", x: 300, y: 10, w: 200, h: 100, parentId: f } as unknown as NewObject);
    const sizes: [number, number][] = [];
    const { ctx } = recordingContext({ opaque: true });
    const t = deps({
      images: { load: async (id: string) => (id === ASSET ? fakeBitmap(4000, 3000) : null) } as ImageProvider,
      canvasFactory: fakeCanvasFactory(ctx, { sizes, blobs: [] }, tinyJpeg()),
    });
    const r = await buildPdf(boardDocSource(doc), { ...OPTS, quality: "print" }, t.d);
    // 200 px at 0.75 pt/px = 150 pt = 2.08 in; at 300 dpi = 625 px wide
    expect(sizes[0][0]).toBe(625);
    expect(r.summary.failedAssets).toEqual(["22222222-2222-4222-8222-222222222222"]);
    expect((await text(r.blob)).startsWith("%PDF-")).toBe(true);
  });

  it("draws a family it does not bundle in Inter and lists it", async () => {
    const doc = new BoardDoc();
    const f = frame(doc, "A", "a0");
    doc.create({ ...defaultsFor("typeSpecimen"), family: "Noto Sans JP", sample: "Aa", x: 10, y: 10, w: 300, h: 200, parentId: f } as unknown as NewObject);
    const r = await buildPdf(boardDocSource(doc), OPTS, deps().d);
    expect(r.summary.substitutedFonts).toEqual(["Noto Sans JP"]);
  });

  it("replaces characters outside the font with a placeholder instead of throwing", async () => {
    const doc = new BoardDoc();
    const f = frame(doc, "A", "a0");
    textIn(doc, f, "Tokyo 東京 ok", 50);
    const r = await buildPdf(boardDocSource(doc), OPTS, deps().d);
    expect(r.summary.warnings.join(" ")).toMatch(/outside the bundled fonts/);
    expect(r.pageCount).toBe(1);
  });

  it("stops with AbortError when the signal aborts mid-build", async () => {
    const doc = new BoardDoc();
    const f = frame(doc, "A", "a0");
    for (let i = 0; i < 5; i++) doc.create({ ...defaultsFor("image"), assetId: ASSET, x: i * 60, y: 10, w: 50, h: 50, parentId: f } as unknown as NewObject);
    const ac = new AbortController();
    let n = 0;
    const t = deps({ signal: ac.signal, images: { load: async () => { if (++n === 2) ac.abort(); return fakeBitmap(); } } as ImageProvider });
    await expect(buildPdf(boardDocSource(doc), OPTS, t.d)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("writes 1,000 small pictures with at most 4 decodes in flight and finishes", async () => {
    const doc = new BoardDoc();
    const f = frame(doc, "A", "a0", { w: 3000, h: 1500 });
    doc.transact(() => {
      for (let i = 0; i < 1000; i++) doc.create({ ...defaultsFor("image"), assetId: ASSET, x: (i % 40) * 70, y: Math.floor(i / 40) * 70, w: 60, h: 60, parentId: f } as unknown as NewObject);
    });
    let inFlight = 0;
    let peak = 0;
    const t = deps({
      images: {
        load: async () => {
          peak = Math.max(peak, ++inFlight);
          await new Promise((r) => setTimeout(r, 0));
          inFlight--;
          return fakeBitmap(100, 100);
        },
      } as ImageProvider,
    });
    const r = await buildPdf(boardDocSource(doc), OPTS, t.d);
    expect(r.pageCount).toBe(1);
    expect(peak).toBeLessThanOrEqual(4);
    expect(t.progress.at(-1)).toBe(1);
  }, 60_000);
});

describe("mixPalettes", () => {
  it("merges close colours, weights by area and normalises", () => {
    const out = mixPalettes([
      { palette: [{ hex: "#ff0000", weight: 0.5 }, { hex: "#0000ff", weight: 0.5 }], area: 100 },
      { palette: [{ hex: "#fe0101", weight: 1 }], area: 100 },
    ]);
    expect(out[0].hex).toMatch(/^#f[ef]0/);
    expect(out.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 6);
    expect(out).toHaveLength(2);
  });
});
