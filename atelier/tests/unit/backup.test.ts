import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { docFromState } from "@/lib/engine/doc/from-state";
import { buildBackup, ENTRY_NAME, ImportError, importBackup, IMPORT_LIMITS, parseBackup, type AssetInfo, type ImportDeps } from "@/lib/engine/export/backup";
import { ZipWriter } from "@/lib/engine/export/zip-writer";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";

const A1 = "11111111-1111-4111-8111-111111111111";
const A2 = "22222222-2222-4222-8222-222222222222";
const A3 = "33333333-3333-4333-8333-333333333333";
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5]);
const mp4 = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 9, 9, 9, 9]);
const signal = () => new AbortController().signal;
const d = () => ({ signal: signal(), onProgress: () => {}, images: { load: async () => null } });

function board(): BoardDoc {
  const doc = new BoardDoc();
  doc.meta.title = "Spring 2027";
  doc.create({ ...defaultsFor("image"), assetId: A1, x: 0, y: 0, w: 200, h: 100, title: "Photo", provenance: { sourceUrl: "https://example.com/p", credit: "Jane", licence: "CC BY", capturedAt: null } } as unknown as NewObject);
  doc.create({ ...defaultsFor("video"), assetId: A2, posterAssetId: A3, x: 300, y: 0 } as unknown as NewObject);
  doc.create({ ...defaultsFor("sticky"), x: 0, y: 300 } as unknown as NewObject);
  return doc;
}
const meta = new Map<string, AssetInfo>([
  [A1, { kind: "image", width: 4000, height: 3000, bytes: 9, palette: [{ hex: "#112233", weight: 1 }], phash: "abcd", title: "Photo", provenance: { sourceUrl: null, credit: "Jane", licence: "CC BY", capturedAt: null } }],
  [A2, { kind: "video", width: 1280, height: 720, bytes: 12, palette: null, phash: null, title: "", provenance: null }],
  [A3, { kind: "image", width: 640, height: 360, bytes: 9, palette: null, phash: null, title: "", provenance: null }],
]);
const originals: Record<string, { blob: Blob; ext: string }> = {
  [A1]: { blob: new Blob([png as BlobPart], { type: "image/png" }), ext: "png" },
  [A2]: { blob: new Blob([mp4 as BlobPart], { type: "video/mp4" }), ext: "mp4" },
  [A3]: { blob: new Blob([png as BlobPart], { type: "image/png" }), ext: "png" },
};
const fetchOriginal = async (id: string) => originals[id] ?? null;

async function makeBackup(): Promise<Blob> {
  return (await buildBackup(board(), meta, { ...d(), fetchOriginal })).blob;
}

/** A valid-looking zip with the given entries (stored, so sizes are exact). */
function zipOf(entries: Record<string, Uint8Array | string>, level: 0 | 6 = 0): Blob {
  const files: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  for (const [k, v] of Object.entries(entries)) files[k] = [typeof v === "string" ? strToU8(v) : v, { level }];
  return new Blob([zipSync(files) as BlobPart]);
}
const manifest = (over: Record<string, unknown> = {}) => JSON.stringify({ format: "atelier", version: 1, schemaVersion: 2, boardTitle: "T", createdAt: "2026-11-12T00:00:00Z", assets: [], ...over });
const validState = () => Y.encodeStateAsUpdate(board().ydoc);

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof ImportError ? e.code : `other:${String(e)}`;
  }
}

/** Overwrite a 32-bit field of one central directory entry. */
async function patchCentral(blob: Blob, name: string, field: "size" | "compSize", value: number): Promise<Blob> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const v = new DataView(buf.buffer);
  for (let i = 0; i < buf.length - 46; i++) {
    if (v.getUint32(i, true) !== 0x02014b50) continue;
    const n = v.getUint16(i + 28, true);
    if (new TextDecoder().decode(buf.subarray(i + 46, i + 46 + n)) === name) v.setUint32(i + (field === "size" ? 24 : 20), value, true);
  }
  return new Blob([buf as BlobPart]);
}

describe("backup round trip", () => {
  it("writes a manifest, the board state and every original, and reads them back", async () => {
    const blob = await makeBackup();
    const p = await parseBackup(blob);
    expect(p.manifest).toMatchObject({ format: "atelier", version: 1, boardTitle: "Spring 2027" });
    expect(p.manifest.assets.map((a) => a.id).sort()).toEqual([A1, A2, A3].sort());
    const a1 = p.manifest.assets.find((a) => a.id === A1)!;
    expect(a1).toMatchObject({ kind: "image", mime: "image/png", width: 4000, height: 3000, phash: "abcd", title: "Photo" });
    expect(a1.palette).toEqual([{ hex: "#112233", weight: 1 }]);
    expect(a1.provenance?.credit).toBe("Jane");
    expect(ENTRY_NAME.test(a1.file)).toBe(true);
    // the state decodes to the same objects
    const restored = docFromState(p.state);
    expect(restored.all().map((o) => `${o.type}:${o.x}:${o.y}`).sort()).toEqual(board().all().map((o) => `${o.type}:${o.x}:${o.y}`).sort());
    expect(restored.meta.title).toBe("Spring 2027");
    // every original is present, byte for byte
    for (const a of p.manifest.assets) {
      const got = new Uint8Array(await (await p.entries.get(a.file)!()).arrayBuffer());
      expect(Array.from(got)).toEqual(Array.from(a.id === A2 ? mp4 : png));
    }
  });

  it("skips an original that cannot be fetched, reports it, and still writes a valid backup", async () => {
    const r = await buildBackup(board(), meta, { ...d(), fetchOriginal: async (id) => (id === A1 ? null : originals[id]) });
    expect(r.summary.failedAssets).toEqual([A1]);
    const p = await parseBackup(r.blob);
    expect(p.manifest.assets.map((a) => a.id)).not.toContain(A1);
  });

  it("stores originals without recompressing them", async () => {
    const blob = await makeBackup();
    const buf = new Uint8Array(await blob.arrayBuffer());
    const v = new DataView(buf.buffer);
    const methods: Record<string, number> = {};
    for (let i = 0; i < buf.length - 46; i++) {
      if (v.getUint32(i, true) !== 0x02014b50) continue;
      const n = v.getUint16(i + 28, true);
      methods[new TextDecoder().decode(buf.subarray(i + 46, i + 46 + n))] = v.getUint16(i + 10, true);
    }
    for (const [name, m] of Object.entries(methods)) if (name.startsWith("assets/")) expect(m).toBe(0);
  });

  it("cancels cleanly: aborts the writer and rejects with AbortError", async () => {
    const ac = new AbortController();
    const promise = buildBackup(board(), meta, { ...d(), signal: ac.signal, fetchOriginal: async (id) => { ac.abort(); return originals[id]; } });
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("parseBackup defences", () => {
  it("refuses path traversal and absolute names before reading anything", async () => {
    for (const name of ["../evil.txt", "assets/a/../../x", "/etc/passwd", "assets/a/b/c.png", "assets\\a\\x.png", "other.txt"]) {
      expect(await code(parseBackup(zipOf({ "manifest.json": manifest(), "board.ydoc": validState(), [name]: "x" }))), name).toBe("bad-entry-name");
    }
  });
  it("refuses a file that is not a zip, or is not an Atelier backup", async () => {
    expect(await code(parseBackup(new Blob(["just text, not an archive at all."])))).toBe("not-atelier");
    expect(await code(parseBackup(new Blob([])))).toBe("not-atelier");
    expect(await code(parseBackup(zipOf({ "board.ydoc": validState() })))).toBe("not-atelier");
    expect(await code(parseBackup(zipOf({ "manifest.json": "{not json", "board.ydoc": validState() })))).toBe("not-atelier");
    expect(await code(parseBackup(zipOf({ "manifest.json": manifest({ format: "other" }), "board.ydoc": validState() })))).toBe("not-atelier");
  });
  it("explains a backup made by a newer version", async () => {
    try {
      await parseBackup(zipOf({ "manifest.json": manifest({ version: 2 }), "board.ydoc": validState() }));
      throw new Error("should not open");
    } catch (e) {
      expect((e as ImportError).code).toBe("newer-version");
      expect((e as Error).message).toContain("Made by a newer version of Atelier");
    }
  });
  it("refuses an oversized manifest and an archive with too many entries", async () => {
    const big = zipOf({ "manifest.json": manifest({ pad: "x".repeat(IMPORT_LIMITS.manifestBytes + 10) }), "board.ydoc": validState() }, 0);
    expect(await code(parseBackup(big))).toBe("too-large");
    const many: Record<string, Uint8Array> = {};
    for (let i = 0; i < IMPORT_LIMITS.entries + 1; i++) many[`assets/a/f${i}.bin`] = new Uint8Array(0);
    expect(await code(parseBackup(zipOf(many)))).toBe("too-large");
  });
  it("refuses a zip bomb from the central directory, before inflating", async () => {
    // 2 MB of zeros deflates to a few KB: a ratio far above the limit
    const bomb = zipOf({ "manifest.json": manifest(), "board.ydoc": validState(), "assets/a/original.bin": new Uint8Array(2_000_000) }, 6);
    expect(await code(parseBackup(bomb))).toBe("zip-bomb");
    // an entry that claims about 4.1 GB
    const claims = await patchCentral(zipOf({ "manifest.json": manifest(), "board.ydoc": validState(), "assets/a/original.bin": new Uint8Array(10) }), "assets/a/original.bin", "size", 4_100_000_000);
    expect(await code(parseBackup(claims))).toBe("zip-bomb");
  });
  it("stops an entry that inflates to more than the directory declared", async () => {
    const real = zipOf({ "manifest.json": manifest({ pad: "y".repeat(5000) }), "board.ydoc": validState() }, 6);
    const lying = await patchCentral(real, "manifest.json", "size", 100);
    expect(await code(parseBackup(lying))).toBe("zip-bomb");
  });
  it("reports a truncated archive as corrupt", async () => {
    const blob = await makeBackup();
    expect(await code(parseBackup(blob.slice(0, blob.size - 30)))).toBe("corrupt");
    expect(await code(parseBackup(blob.slice(0, 40)))).toBe("corrupt");
  });
  it("ignores manifest assets whose file is not in the archive", async () => {
    const a = { id: "x", file: "assets/x/original.png", kind: "image", mime: "image/png", width: 1, height: 1, bytes: 1, palette: null, phash: null, title: "", provenance: null };
    const p = await parseBackup(zipOf({ "manifest.json": manifest({ assets: [a] }), "board.ydoc": validState() }));
    expect(p.entries.size).toBe(0);
  });
});

function deps(over: Partial<ImportDeps> = {}) {
  const written: { boardId: string; state: Uint8Array; title: string }[] = [];
  const added: string[] = [];
  const out: ImportDeps = {
    createBoard: async () => "new-board",
    writeBoardState: async (boardId, state, title) => void written.push({ boardId, state, title }),
    uploader: { addAssetOnly: async (_f, o) => { const id = `new-${added.length}-${o?.name ?? ""}`; added.push(id); return id; } },
    ...over,
  };
  return { out, written, added };
}

describe("importBackup", () => {
  it("creates a new board, remaps every picture reference to the new asset ids and keeps the rest", async () => {
    const t = deps();
    const r = await importBackup(await makeBackup(), t.out, { signal: signal(), onProgress: () => {} });
    expect(r).toMatchObject({ boardId: "new-board", title: "Spring 2027", skippedObjects: 0, failedAssets: [] });
    expect(t.written).toHaveLength(1);
    const doc = docFromState(t.written[0].state);
    const all = doc.all();
    const image = all.find((o) => o.type === "image")!;
    const video = all.find((o) => o.type === "video")!;
    expect(image.type === "image" && image.assetId.startsWith("new-")).toBe(true);
    expect(video.type === "video" && video.assetId.startsWith("new-") && video.posterAssetId?.startsWith("new-")).toBe(true);
    expect(all.some((o) => o.type === "sticky")).toBe(true);
    // no old id is left behind
    expect(JSON.stringify(all)).not.toContain(A1);
    expect(t.added).toHaveLength(3);
  });

  it("migrates an old board and skips (and counts) an object that no longer validates", async () => {
    const ydoc = new Y.Doc();
    const objects = ydoc.getMap<Y.Map<unknown>>("objects");
    ydoc.transact(() => {
      const mk = (id: string, props: Record<string, unknown>) => {
        const m = new Y.Map<unknown>();
        for (const [k, v] of Object.entries({ x: 0, y: 0, w: 100, h: 100, rotation: 0, parentId: null, index: "a0", locked: false, opacity: 1, createdAt: 1, updatedAt: 1, ...props })) m.set(k, v);
        objects.set(id, m);
      };
      // a Phase 1 image: no mask, grayscale, title or provenance
      mk("old", { type: "image", assetId: A1, crop: null, flipX: false, flipY: false });
      mk("bad", { type: "shape", x: NaN, kind: "rect", fill: null, stroke: null, strokeWidth: 1, strokeStyle: "solid", cornerRadius: 0 });
      ydoc.getMap("meta").set("title", "Old board");
    });
    const blob = zipOf({ "manifest.json": manifest({ schemaVersion: 1 }), "board.ydoc": Y.encodeStateAsUpdate(ydoc) });
    const t = deps();
    const r = await importBackup(blob, t.out, { signal: signal(), onProgress: () => {} });
    expect(r.skippedObjects).toBe(1);
    const doc = docFromState(t.written[0].state);
    expect(doc.all()).toHaveLength(1);
    const img = doc.all()[0];
    expect(img.type === "image" && img.mask.kind).toBe("rect"); // migrated
    expect(doc.meta.schemaVersion).toBeGreaterThanOrEqual(2);
  });

  it("keeps a picture whose upload failed as a placeholder and lists it", async () => {
    const t = deps({ uploader: { addAssetOnly: async (_f, o) => { if (o?.name?.startsWith("Photo")) throw new Error("unsupported"); return "ok-id"; } } });
    const r = await importBackup(await makeBackup(), t.out, { signal: signal(), onProgress: () => {} });
    expect(r.failedAssets).toEqual([A1]);
    const doc = docFromState(t.written[0].state);
    const image = doc.all().find((o) => o.type === "image")!;
    expect(image.type === "image" && image.assetId).toBeTruthy();
    expect(image.type === "image" && image.assetId).not.toBe(A1);
    expect(image.type === "image" && image.assetId).not.toBe("ok-id");
  });

  it("makes no board when cancelled, and removes one whose state could not be written", async () => {
    const ac = new AbortController();
    let created = 0;
    const t = deps({ createBoard: async () => { created++; return "b"; }, uploader: { addAssetOnly: async () => { ac.abort(); return "x"; } } });
    await expect(importBackup(await makeBackup(), t.out, { signal: ac.signal, onProgress: () => {} })).rejects.toMatchObject({ name: "AbortError" });
    expect(created).toBe(0);
    const discarded: string[] = [];
    const fail = deps({ writeBoardState: async () => { throw new Error("disk full"); }, discardBoard: async (id) => void discarded.push(id) });
    await expect(importBackup(await makeBackup(), fail.out, { signal: signal(), onProgress: () => {} })).rejects.toThrow("disk full");
    expect(discarded).toEqual(["new-board"]);
  });

  it("never touches an existing board: the only board it creates is the new one", async () => {
    const t = deps();
    const created: string[] = [];
    t.out.createBoard = async () => { created.push("n1"); return "n1"; };
    await importBackup(await makeBackup(), t.out, { signal: signal(), onProgress: () => {} });
    expect(created).toEqual(["n1"]);
    expect(t.written.map((w) => w.boardId)).toEqual(["n1"]);
  });
});

describe("ZipWriter", () => {
  it("streams to a sink without building a Blob, and can be aborted", async () => {
    const parts: Uint8Array[] = [];
    let aborted = false;
    const sink = new WritableStream<Uint8Array>({ write: (c) => void parts.push(c), abort: () => void (aborted = true) });
    const z = new ZipWriter({ sink });
    await z.addBytes("a.txt", "hello");
    await z.addBlob("assets/x/original.bin", new Blob([png as BlobPart]));
    expect(await z.finish()).toBeNull();
    const total = parts.reduce((n, p) => n + p.length, 0);
    expect(total).toBeGreaterThan(40);
    const z2 = new ZipWriter({ sink: new WritableStream<Uint8Array>({ abort: () => void (aborted = true) }) });
    await z2.addBytes("b.txt", "x");
    await z2.abort();
    expect(aborted).toBe(true);
  });
});
