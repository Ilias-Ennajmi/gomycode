import { describe, expect, it } from "vitest";
import { buildZip, estimateZipBytes, uniqueFileName, zipGuard, ZIP_LIMITS, type ZipOptions } from "@/lib/engine/export/zip";
import { readCentralDirectory, readEntry } from "@/lib/engine/export/zip-reader";
import type { CreditsRow } from "@/lib/engine/provenance/credits";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5]);
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 9, 9, 9]);

const asset = (assetId: string, title: string, bytes = 100) => ({ assetId, title, bytes });
const fetchOk = async (id: string) => ({ blob: new Blob([id === C ? (jpg as BlobPart) : (png as BlobPart)], { type: id === C ? "image/jpeg" : "image/png" }), ext: id === C ? "jpg" : "png" });
const deps = (over: Partial<Parameters<typeof buildZip>[1]> = {}) => ({ signal: new AbortController().signal, onProgress: () => {}, fetchOriginal: fetchOk, ...over });

const base = (over: Partial<ZipOptions> = {}): ZipOptions => ({
  boardTitle: "Spring 2027",
  assets: [asset(A, "Sunset"), asset(B, "Harbour"), asset(C, "Sunset")],
  palette: [{ hex: "#2f4a6d", name: "Ink blue", weight: 0.5 }, { hex: "#d9774a", name: "Clay", weight: 0.5 }],
  includePalette: true,
  credits: (fileOf) => [{ file: fileOf(A), source: "https://example.com/a", credit: "Jane", licence: "CC BY", capturedAt: "" }],
  frames: null,
  ...over,
});

async function open(blob: Blob) {
  const entries = await readCentralDirectory(blob, { maxEntries: 1000 });
  const text = async (name: string) => new TextDecoder().decode(new Uint8Array(await (await readEntry(blob, entries.find((e) => e.name === name)!)).arrayBuffer()));
  return { entries, names: entries.map((e) => e.name), text, find: (n: string) => entries.find((e) => e.name === n) };
}

describe("uniqueFileName", () => {
  it("keeps good names, sanitises bad ones and numbers collisions", () => {
    const used = new Set<string>();
    expect(uniqueFileName("photo", "jpg", used)).toBe("photo.jpg");
    expect(uniqueFileName("photo", "jpg", used)).toBe("photo (2).jpg");
    expect(uniqueFileName("photo", "jpg", used)).toBe("photo (3).jpg");
    expect(uniqueFileName("a/b:c?", "jpg", new Set())).toBe("a_b_c_.jpg");
    expect(uniqueFileName("Café été", "png", new Set())).toBe("Café été.png");
  });
  it("collisions ignore case (macOS and Windows would overwrite)", () => {
    const used = new Set<string>();
    uniqueFileName("Photo", "jpg", used);
    expect(uniqueFileName("photo", "JPG", used)).toBe("photo (2).jpg");
  });
  it("never produces a path, a dot name, a reserved name or an empty one", () => {
    const used = new Set<string>();
    for (const bad of ["../../etc/passwd", "..", ".", "...hidden", "CON", "nul", "", "   ", "\u0000‮", "a\\b"]) {
      const n = uniqueFileName(bad, "png", used);
      expect(n).not.toMatch(/[\\/\u0000]/);
      expect(n.startsWith(".")).toBe(false);
      expect(n).not.toContain("..");
      expect(n).toMatch(/\.png$/);
      expect(n.length).toBeGreaterThan(4);
    }
    expect(uniqueFileName("CON", "png", new Set())).not.toMatch(/^con\./i);
  });
  it("caps the whole name at 80 characters, extension kept, even after numbering", () => {
    const used = new Set<string>();
    const long = "x".repeat(200);
    const a = uniqueFileName(long, "jpeg", used);
    const b = uniqueFileName(long, "jpeg", used);
    expect(a.length).toBe(80);
    expect(a.endsWith(".jpeg")).toBe(true);
    expect(b.length).toBeLessThanOrEqual(80);
    expect(b.endsWith(" (2).jpeg")).toBe(true);
    expect(b).not.toBe(a);
  });
  it("an odd extension is cleaned to letters and digits", () => {
    expect(uniqueFileName("a", "j/p g!", new Set())).toBe("a.jpg");
    expect(uniqueFileName("a", "", new Set())).toBe("a.bin");
  });
});

describe("estimateZipBytes and the guard", () => {
  it("sums the declared bytes and ignores junk", () => {
    expect(estimateZipBytes([{ bytes: 1000 }, { bytes: 2000 }])).toBeGreaterThanOrEqual(3000);
    expect(estimateZipBytes([{ bytes: 1000 }, { bytes: NaN }, { bytes: -5 }, { bytes: Infinity }])).toBeLessThan(1000 + 200_000);
    expect(estimateZipBytes([])).toBeGreaterThan(0);
  });
  it("asks for confirmation over 500 MB when building in memory, not when saving straight to a file", () => {
    const big = { count: 10, estimatedBytes: 600 * 1024 * 1024, frames: 0 };
    expect(zipGuard(big, { hasSink: false })).toMatchObject({ ok: true, confirm: expect.stringMatching(/600 MB/) });
    expect(zipGuard(big, { hasSink: true })).toEqual({ ok: true });
    expect(zipGuard({ ...big, estimatedBytes: 10 * 1024 * 1024 }, { hasSink: false })).toEqual({ ok: true });
  });
  it("refuses what a browser cannot hold, with the way out", () => {
    const g1 = zipGuard({ count: 10, estimatedBytes: ZIP_LIMITS.memoryBytes + 1, frames: 0 }, { hasSink: false });
    expect(g1).toMatchObject({ ok: false, reason: expect.stringMatching(/Chrome|Edge|save/i) });
    const g2 = zipGuard({ count: 10, estimatedBytes: ZIP_LIMITS.totalBytes + 1, frames: 0 }, { hasSink: true });
    expect(g2).toMatchObject({ ok: false, reason: expect.stringMatching(/4 GB|too large/i) });
    const g3 = zipGuard({ count: ZIP_LIMITS.maxAssets + 1, estimatedBytes: 1, frames: 0 }, { hasSink: true });
    expect(g3).toMatchObject({ ok: false, reason: expect.stringMatching(/pictures/i) });
    const g4 = zipGuard({ count: 1, estimatedBytes: 1, frames: ZIP_LIMITS.maxFrames + 1 }, { hasSink: true });
    expect(g4).toMatchObject({ ok: false, reason: expect.stringMatching(/frames/i) });
  });
});

describe("buildZip: the golden structure", () => {
  it("has the originals, credits.csv, every palette format, a manifest and a README, read back with the zip reader", async () => {
    const r = await buildZip(base(), deps());
    expect(r.blob).toBeInstanceOf(Blob);
    const z = await open(r.blob!);
    expect(z.names.sort()).toEqual(
      [
        "README.txt",
        "credits.csv",
        "manifest.json",
        "originals/Harbour.png",
        "originals/Sunset.jpg",
        "originals/Sunset.png",
        "palette/Spring 2027-colors.css",
        "palette/Spring 2027-tailwind.config.js",
        "palette/Spring 2027-theme.css",
        "palette/Spring 2027.ase",
        "palette/Spring 2027.json",
        "palette/Spring 2027.swatches",
      ].sort(),
    );
    expect(r.fileCount).toBe(z.names.length);
    expect(r.summary.failedAssets).toEqual([]);
  });

  it("the originals are the exact bytes, stored (not recompressed)", async () => {
    const r = await buildZip(base(), deps());
    const z = await open(r.blob!);
    for (const n of ["originals/Sunset.png", "originals/Harbour.png", "originals/Sunset.jpg"]) expect(z.find(n)!.method).toBe(0);
    const bytes = new Uint8Array(await (await readEntry(r.blob!, z.find("originals/Sunset.png")!)).arrayBuffer());
    expect([...bytes]).toEqual([...png]);
  });

  it("credits.csv names the files in the zip, for the assets that have credits only; CSV is injection-safe", async () => {
    const rows: CreditsRow[] = [];
    const r = await buildZip(
      base({
        credits: (fileOf) => {
          rows.push({ file: fileOf(A), source: "", credit: "", licence: "", capturedAt: "" });
          return [
            { file: fileOf(A), source: "https://example.com/a", credit: "Jane, Doe", licence: "CC BY", capturedAt: "" },
            { file: fileOf(B), source: "", credit: "=HYPERLINK(\"http://evil\")", licence: "", capturedAt: "" },
          ];
        },
      }),
      deps(),
    );
    const csv = await (await open(r.blob!)).text("credits.csv");
    const lines = csv.replace(/^﻿/, "").split("\r\n");
    expect(lines[0]).toBe("file,source,credit,licence,captured");
    expect(lines[1]).toBe('originals/Sunset.png,https://example.com/a,"Jane, Doe",CC BY,');
    expect(lines[2]).toBe("originals/Harbour.png,,\"'=HYPERLINK(\"\"http://evil\"\")\",,");
    expect(lines).toHaveLength(4); // trailing CRLF
    expect(rows).toHaveLength(1);
  });

  it("with no credits callback there is no credits.csv; includePalette false leaves the palette folder out", async () => {
    const r = await buildZip(base({ credits: null, includePalette: false }), deps());
    const z = await open(r.blob!);
    expect(z.names).not.toContain("credits.csv");
    expect(z.names.some((n) => n.startsWith("palette/"))).toBe(false);
  });

  it("an empty palette writes no palette files and says so in the README", async () => {
    const r = await buildZip(base({ palette: [] }), deps());
    const z = await open(r.blob!);
    expect(z.names.some((n) => n.startsWith("palette/"))).toBe(false);
    expect(await z.text("README.txt")).toMatch(/no palette/i);
  });

  it("the palette files hold the colours", async () => {
    const r = await buildZip(base(), deps());
    const z = await open(r.blob!);
    const css = await z.text("palette/Spring 2027-colors.css");
    expect(css).toContain("--color-");
    expect(css.toLowerCase()).toContain("#2f4a6d");
    expect(JSON.parse(await z.text("palette/Spring 2027.json"))).toBeTruthy();
  });

  it("manifest.json lists every file and every skipped one", async () => {
    const r = await buildZip(base(), deps({ fetchOriginal: async (id) => (id === B ? null : fetchOk(id)) }));
    const z = await open(r.blob!);
    const m = JSON.parse(await z.text("manifest.json"));
    expect(m).toMatchObject({ format: "atelier-export", version: 1, boardTitle: "Spring 2027" });
    expect(m.files.map((f: { path: string }) => f.path)).toContain("originals/Sunset.png");
    expect(m.files.find((f: { path: string }) => f.path === "originals/Sunset.png")).toMatchObject({ assetId: A, bytes: png.length });
    expect(m.skipped).toEqual([{ assetId: B, title: "Harbour", reason: "Could not be downloaded" }]);
  });

  it("two pictures with the same title and type get distinct names", async () => {
    const r = await buildZip(base({ assets: [asset(A, "Sunset"), asset(B, "sunset")], credits: null, includePalette: false }), deps());
    expect((await open(r.blob!)).names.filter((n) => n.startsWith("originals/"))).toEqual(["originals/Sunset.png", "originals/sunset (2).png"]);
  });

  it("an asset used twice is one file (the caller passes it once); zero assets still gives a valid zip with a README", async () => {
    const r = await buildZip(base({ assets: [], credits: null, includePalette: false }), deps());
    const z = await open(r.blob!);
    expect(z.names.sort()).toEqual(["README.txt", "manifest.json"]);
    expect(await z.text("README.txt")).toMatch(/Spring 2027/);
  });

  it("progress ends at 1 and never goes backwards", async () => {
    const seen: number[] = [];
    await buildZip(base(), deps({ onProgress: (r) => seen.push(r) }));
    expect(seen.at(-1)).toBe(1);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
  });
});

describe("buildZip: per-frame images", () => {
  it("adds frames/NN-name.png in order, de-duplicating names", async () => {
    const r = await buildZip(
      base({ frames: [{ frameId: "f1", name: "Intro" }, { frameId: "f2", name: "Intro" }, { frameId: "f3", name: "" }] }),
      deps({ renderFrame: async (id) => new Blob([png as BlobPart, new Uint8Array([id.charCodeAt(1)]) as BlobPart], { type: "image/png" }) }),
    );
    const z = await open(r.blob!);
    expect(z.names.filter((n) => n.startsWith("frames/")).sort()).toEqual(["frames/01-Intro.png", "frames/02-Intro.png", "frames/03-Frame.png"]);
    expect(z.find("frames/01-Intro.png")!.method).toBe(0);
  });

  it("a frame that fails to render is skipped and reported; the rest are kept", async () => {
    const r = await buildZip(
      base({ frames: [{ frameId: "f1", name: "One" }, { frameId: "f2", name: "Two" }] }),
      deps({ renderFrame: async (id) => { if (id === "f1") throw new Error("boom"); return new Blob([png as BlobPart]); } }),
    );
    const z = await open(r.blob!);
    expect(z.names).toContain("frames/02-Two.png");
    expect(z.names).not.toContain("frames/01-One.png");
    expect(r.summary.warnings.join(" ")).toMatch(/One/);
    expect(await z.text("README.txt")).toMatch(/One/);
  });

  it("no renderFrame, no frames folder", async () => {
    const r = await buildZip(base({ frames: [{ frameId: "f1", name: "One" }] }), deps());
    expect((await open(r.blob!)).names.some((n) => n.startsWith("frames/"))).toBe(false);
  });
});

describe("buildZip: failures, caps and cancel", () => {
  it("an original that cannot be downloaded (null or thrown) is skipped, listed in the summary and the README", async () => {
    const r = await buildZip(base(), deps({ fetchOriginal: async (id) => { if (id === A) return null; if (id === B) throw new Error("net"); return fetchOk(id); } }));
    expect(r.summary.failedAssets.sort()).toEqual([A, B].sort());
    const z = await open(r.blob!);
    expect(z.names.filter((n) => n.startsWith("originals/"))).toEqual(["originals/Sunset.jpg"]);
    const readme = await z.text("README.txt");
    expect(readme).toContain("Sunset");
    expect(readme).toContain("Harbour");
    // credits still list the picture whose file is missing, saying so
    const csv = (await z.text("credits.csv")).replace(/^﻿/, "");
    expect(csv).toContain("(not in this ZIP)");
  });

  it("a file over the per-file cap is skipped with its reason", async () => {
    const r = await buildZip(base(), deps({ limits: { perFileBytes: 5 } }));
    expect(r.summary.failedAssets.sort()).toEqual([A, B, C].sort());
    expect(await (await open(r.blob!)).text("README.txt")).toMatch(/too large/i);
  });

  it("stops adding originals once the total cap is reached, and says so", async () => {
    const r = await buildZip(base(), deps({ limits: { totalBytes: png.length + 1 } }));
    const z = await open(r.blob!);
    expect(z.names.filter((n) => n.startsWith("originals/"))).toHaveLength(1);
    expect(r.summary.failedAssets).toHaveLength(2);
    expect(await z.text("README.txt")).toMatch(/4 GB/);
    expect(r.summary.warnings.join(" ")).toMatch(/left out/i);
  });

  it("refuses a board over the guard before fetching anything", async () => {
    let fetched = 0;
    const assets = Array.from({ length: ZIP_LIMITS.maxAssets + 1 }, (_, i) => asset(`id${i}`, `p${i}`));
    await expect(buildZip(base({ assets }), deps({ fetchOriginal: async (id) => (fetched++, fetchOk(id)) }))).rejects.toMatchObject({ name: "ZipRefused", message: expect.stringMatching(/pictures/i) });
    expect(fetched).toBe(0);
  });

  it("fetches at most 3 originals at a time", async () => {
    let now = 0;
    let peak = 0;
    const assets = Array.from({ length: 12 }, (_, i) => asset(`id${i}`, `p${i}`));
    await buildZip(
      base({ assets, credits: null }),
      deps({
        fetchOriginal: async (id) => {
          now++;
          peak = Math.max(peak, now);
          await new Promise((r) => setTimeout(r, 5));
          now--;
          return fetchOk(id);
        },
      }),
    );
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it("writes originals in the order given even when later fetches finish first", async () => {
    const r = await buildZip(
      base({ credits: null, includePalette: false }),
      deps({ fetchOriginal: async (id) => { await new Promise((res) => setTimeout(res, id === A ? 30 : 1)); return fetchOk(id); } }),
    );
    const z = await open(r.blob!);
    expect(z.names.filter((n) => n.startsWith("originals/"))).toEqual(["originals/Sunset.png", "originals/Harbour.png", "originals/Sunset.jpg"]);
  });

  it("cancel mid-way rejects with AbortError, produces no blob, and aborts the sink", async () => {
    const ac = new AbortController();
    let aborted = false;
    let wrote = 0;
    const sink = new WritableStream<Uint8Array>({ write: (c) => void (wrote += c.length), abort: () => void (aborted = true) });
    let calls = 0;
    const p = buildZip(base(), deps({ signal: ac.signal, sink, fetchOriginal: async (id) => { if (++calls === 2) ac.abort(); return fetchOk(id); } }));
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    expect(aborted).toBe(true);
    expect(wrote).toBeGreaterThanOrEqual(0);
  });

  it("cancel while a download is stuck returns promptly instead of waiting for it", async () => {
    const ac = new AbortController();
    const started = Date.now();
    const p = buildZip(base(), deps({ signal: ac.signal, fetchOriginal: () => new Promise(() => {}) }));
    setTimeout(() => ac.abort(), 20);
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("an already-aborted signal rejects before any work", async () => {
    const ac = new AbortController();
    ac.abort();
    let fetched = 0;
    await expect(buildZip(base(), deps({ signal: ac.signal, fetchOriginal: async (id) => (fetched++, fetchOk(id)) }))).rejects.toMatchObject({ name: "AbortError" });
    expect(fetched).toBe(0);
  });
});

describe("buildZip: saving straight to a file", () => {
  it("with a sink no Blob is built and the bytes arrive as a complete zip", async () => {
    const chunks: Uint8Array[] = [];
    const sink = new WritableStream<Uint8Array>({ write: (c) => void chunks.push(c) });
    const r = await buildZip(base(), deps({ sink }));
    expect(r.blob).toBeNull();
    const blob = new Blob(chunks as BlobPart[]);
    const z = await open(blob);
    expect(z.names).toContain("originals/Sunset.png");
    expect(z.names).toContain("README.txt");
  });
});
