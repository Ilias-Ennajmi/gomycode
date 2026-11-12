import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { parseBackup, planBackup } from "@/lib/engine/export/backup";
import { buildAssetTable, createOriginalFetcher } from "@/lib/engine/export/images";
import { runBackupJob, runJsonCanvasJob } from "@/lib/engine/export/jobs";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";

const A1 = "11111111-1111-4111-8111-111111111111";
const A2 = "22222222-2222-4222-8222-222222222222";
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
const ctx = { signal: new AbortController().signal, onProgress: () => {} };
const fetchFn = (async (url: string) => (url.includes("missing") ? new Response("no", { status: 404 }) : new Response(png))) as unknown as typeof fetch;
const table = (ids: string[]) =>
  buildAssetTable(ids, { urlsFor: (id) => ({ original: `https://cdn/${id === A2 ? "missing" : "ok"}/${id}` }), available: () => null });

function board() {
  const doc = new BoardDoc();
  doc.meta.title = "My: board";
  doc.create({ ...defaultsFor("image"), assetId: A1, x: 0, y: 0 } as unknown as NewObject);
  doc.create({ ...defaultsFor("image"), assetId: A2, x: 400, y: 0 } as unknown as NewObject);
  return doc;
}

describe("createOriginalFetcher", () => {
  it("returns the bytes with an extension from what they are, and null for a failed fetch", async () => {
    const f = createOriginalFetcher(table([A1, A2]), fetchFn);
    const got = await f(A1);
    expect(got?.ext).toBe("png");
    expect(got?.blob.size).toBe(png.length);
    expect(await f(A2)).toBeNull();
    expect(await f("unknown")).toBeNull();
  });
});

describe("backup job", () => {
  it("writes a readable .atelier file and reports the original it could not fetch", async () => {
    const doc = board();
    const plan = planBackup(doc, { get: () => undefined });
    const r = await runBackupJob({ plan, assets: table([A1, A2]) }, ctx, { fetchFn });
    expect(r.summary.failedAssets).toEqual([A2]);
    const parsed = await parseBackup(r.blob);
    expect(parsed.manifest.assets.map((a) => a.id)).toEqual([A1]);
    expect(parsed.manifest.boardTitle).toBe("My: board");
    // the state in the backup is the board's
    const copy = new Y.Doc();
    Y.applyUpdate(copy, parsed.state);
    expect(copy.getMap("objects").size).toBe(2);
  });
});

describe("JSON Canvas job", () => {
  it("is a zip of the .canvas file and its attachments when pictures are fetched", async () => {
    const doc = board();
    const r = await runJsonCanvasJob({ state: Y.encodeStateAsUpdate(doc.ydoc), assets: table([A1, A2]), title: doc.meta.title }, ctx, { fetchFn });
    expect(r.summary.extension).toBe("zip");
    const files = unzipSync(new Uint8Array(await r.blob.arrayBuffer()));
    const names = Object.keys(files);
    expect(names).toContain("My board.canvas");
    expect(names).toContain(`attachments/${A1}.png`);
    const canvas = JSON.parse(new TextDecoder().decode(files["My board.canvas"]));
    expect(canvas.nodes.filter((n: { type: string }) => n.type === "file")).toHaveLength(1);
    expect(r.summary.failedAssets).toEqual([A2]);
    expect(r.summary.warnings.join(" ")).toMatch(/1 picture or video was left out/);
  });

  it("is a plain .canvas file when no picture could be fetched", async () => {
    const doc = new BoardDoc();
    doc.create({ ...defaultsFor("sticky") } as unknown as NewObject);
    const r = await runJsonCanvasJob({ state: Y.encodeStateAsUpdate(doc.ydoc), assets: {}, title: "x" }, ctx, { fetchFn });
    expect(r.summary.extension).toBe("canvas");
    expect(JSON.parse(await r.blob.text()).nodes).toHaveLength(1);
  });

  it("stops when cancelled", async () => {
    const ac = new AbortController();
    ac.abort();
    const doc = board();
    await expect(runJsonCanvasJob({ state: Y.encodeStateAsUpdate(doc.ydoc), assets: table([A1]), title: "t" }, { ...ctx, signal: ac.signal }, { fetchFn })).rejects.toMatchObject({ name: "AbortError" });
  });
});
