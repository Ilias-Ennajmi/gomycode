import { describe, expect, it } from "vitest";
import { AssetMetaStore } from "@/lib/assets/meta-store";
import { AssetResolverImpl } from "@/lib/assets/resolver";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { estimateMeasurer } from "@/lib/engine/export/export-api";
import { ExportCancelled } from "@/lib/engine/export/protocol";
import { readCentralDirectory } from "@/lib/engine/export/zip-reader";
import { exportZip, planZipExport } from "@/lib/engine/export/zip-api";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const V = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5]);

const meta = new AssetMetaStore({ persist: false });
const resolver = new AssetResolverImpl({ publicHost: "img.example.com", meta });
meta.put({ id: A, kind: "image", width: 4000, height: 3000, bytes: 1000, variants: ["w1024"], palette: [{ hex: "#112233", weight: 0.6 }, { hex: "#ddeeff", weight: 0.4 }], phash: null, title: "Sunset", provenance: { sourceUrl: "https://example.com/a", credit: "Jane", licence: "CC BY", capturedAt: null }, analysisVersion: 1 });
meta.put({ id: B, kind: "image", width: 800, height: 600, bytes: 2000, variants: ["w1024"], palette: null, phash: null, title: "", provenance: null, analysisVersion: 1 });
meta.put({ id: V, kind: "video", width: 1280, height: 720, bytes: 5000, variants: ["w1024"], palette: null, phash: null, title: "", provenance: null, analysisVersion: 1 });

function board(withPalette = true) {
  const doc = new BoardDoc();
  doc.meta.title = "Spring 2027";
  const f = doc.create({ ...defaultsFor("frame"), name: "Intro", order: "a0", x: 0, y: 0 } as unknown as NewObject);
  doc.create({ ...defaultsFor("frame"), name: "Moodboard", order: "a1", x: 2000, y: 0 } as unknown as NewObject);
  doc.create({ ...defaultsFor("image"), assetId: A, title: "Sunset", x: 10, y: 10, w: 400, h: 300, parentId: f, provenance: { sourceUrl: "https://example.com/a", credit: "Jane", licence: "CC BY", capturedAt: null } } as unknown as NewObject);
  doc.create({ ...defaultsFor("image"), assetId: A, title: "Sunset again", x: 500, y: 10, w: 100, h: 100 } as unknown as NewObject);
  doc.create({ ...defaultsFor("image"), assetId: B, title: "", x: 0, y: 700, w: 100, h: 100 } as unknown as NewObject);
  doc.create({ ...defaultsFor("video"), assetId: V, x: 0, y: 900, w: 100, h: 100 } as unknown as NewObject);
  if (withPalette) doc.create({ ...defaultsFor("palette"), swatches: [{ hex: "#2f4a6d", weight: 0.7, name: "Ink", locked: false }, { hex: "#d9774a", weight: 0.3, name: "Clay", locked: false }], x: 0, y: 1200 } as unknown as NewObject);
  return doc;
}

describe("planZipExport", () => {
  it("lists each picture and video once, titled, with its size, and counts frames", () => {
    const plan = planZipExport(board(), meta);
    expect(plan.assets.map((a) => a.assetId)).toEqual([A, B, V]);
    expect(plan.assets[0]).toMatchObject({ title: "Sunset", bytes: 1000 });
    expect(plan.assets[1].title).toBe("image");
    expect(plan.assets[2].title).toBe("video");
    expect(plan.frames.map((f) => f.name)).toEqual(["Intro", "Moodboard"]);
    expect(plan.estimatedBytes).toBeGreaterThan(8000);
  });

  it("takes the board's palette object; without one it mixes the pictures' colours; with neither it is empty", () => {
    expect(planZipExport(board(), meta).palette.map((c) => c.hex)).toEqual(["#2f4a6d", "#d9774a"]);
    expect(planZipExport(board(false), meta).palette.length).toBeGreaterThan(0);
    expect(planZipExport(new BoardDoc(), meta).palette).toEqual([]);
  });
});

function fakeManager() {
  const runs: { kind: string; frame: string | null }[] = [];
  let cancelled = 0;
  return {
    runs,
    get cancelled() {
      return cancelled;
    },
    run(kind: string, payload: unknown) {
      runs.push({ kind, frame: null });
      void payload;
      return { promise: Promise.resolve({ blob: new Blob([png as BlobPart], { type: "image/png" }), summary: { failedAssets: [], substitutedFonts: [], warnings: [] } }), cancel: () => void cancelled++ };
    },
  };
}

const fetchFn = (async (url: string) => new Response(new Blob([png as BlobPart], { type: "image/png" }), { status: url.includes(B) ? 404 : 200 })) as unknown as typeof fetch;

async function names(blob: Blob) {
  return (await readCentralDirectory(blob, { maxEntries: 1000 })).map((e) => e.name).sort();
}

describe("exportZip", () => {
  const deps = (m = fakeManager()) => ({ manager: m, assets: resolver, measure: estimateMeasurer, meta, fetchFn });

  it("makes the ZIP: originals (the one that 404s is left out and reported), credits, palette, frame images", async () => {
    const m = fakeManager();
    const r = await exportZip(board(), { includeCredits: true, includePalette: true, includeFrames: true }, deps(m)).promise;
    expect(r.filename).toBe("Spring 2027.zip");
    expect(r.blob).toBeInstanceOf(Blob);
    const n = await names(r.blob!);
    expect(n).toContain("originals/Sunset.png");
    expect(n).toContain("originals/video.png"); // fetched bytes decide the extension, not the asset kind
    expect(n).not.toContain("originals/image.png");
    expect(n).toContain("credits.csv");
    expect(n).toContain("palette/Spring 2027.ase");
    expect(n).toContain("frames/01-Intro.png");
    expect(n).toContain("frames/02-Moodboard.png");
    expect(r.summary.failedAssets).toEqual([B]);
    expect(m.runs.filter((x) => x.kind === "raster")).toHaveLength(2);
  });

  it("the credits sheet lists credited pictures with their path in the ZIP; a missing file is marked", async () => {
    const r = await exportZip(board(), { includeCredits: true, includePalette: false, includeFrames: false }, deps()).promise;
    const entries = await readCentralDirectory(r.blob!, { maxEntries: 1000 });
    const { readEntry } = await import("@/lib/engine/export/zip-reader");
    const csv = new TextDecoder().decode(new Uint8Array(await (await readEntry(r.blob!, entries.find((e) => e.name === "credits.csv")!)).arrayBuffer())).replace(/^﻿/, "");
    expect(csv.split("\r\n")).toEqual(["file,source,credit,licence,captured", "originals/Sunset.png,https://example.com/a,Jane,CC BY,", ""]);
  });

  it("options turn parts off", async () => {
    const r = await exportZip(board(), { includeCredits: false, includePalette: false, includeFrames: false }, deps()).promise;
    const n = await names(r.blob!);
    expect(n.some((x) => x.startsWith("palette/") || x.startsWith("frames/") || x === "credits.csv")).toBe(false);
    expect(n).toContain("originals/Sunset.png");
  });

  it("saves straight to a file when given a sink: no Blob comes back", async () => {
    const chunks: Uint8Array[] = [];
    const sink = new WritableStream<Uint8Array>({ write: (c) => void chunks.push(c) });
    const r = await exportZip(board(), { includeCredits: true, includePalette: true, includeFrames: false, sink }, deps()).promise;
    expect(r.blob).toBeNull();
    expect(await names(new Blob(chunks as BlobPart[]))).toContain("originals/Sunset.png");
  });

  it("cancel rejects with ExportCancelled", async () => {
    const h = exportZip(board(), { includeCredits: true, includePalette: true, includeFrames: true }, { ...deps(), fetchFn: (() => new Promise(() => {})) as never });
    setTimeout(() => h.cancel(), 10);
    await expect(h.promise).rejects.toBeInstanceOf(ExportCancelled);
  });

  it("a board over the picture limit is refused in words, before anything is downloaded", async () => {
    const doc = new BoardDoc();
    for (let i = 0; i < 2001; i++) doc.create({ ...defaultsFor("image"), assetId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, x: i, y: 0 } as unknown as NewObject);
    let fetched = 0;
    const h = exportZip(doc, { includeCredits: false, includePalette: false, includeFrames: false }, { ...deps(), fetchFn: (async () => (fetched++, new Response(""))) as never });
    await expect(h.promise).rejects.toMatchObject({ name: "ZipRefused", message: expect.stringMatching(/2,000/) });
    expect(fetched).toBe(0);
  });
});
