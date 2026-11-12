import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { AssetResolverImpl } from "@/lib/assets/resolver";
import { AssetUploader, type ProcessedImage } from "@/lib/assets/upload-queue";
import { createLocalLibraryApi } from "@/lib/assets/local-library";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }));
});

const processed = (w: number, h: number, hash: string): ProcessedImage => ({
  width: w, height: h, mime: "image/jpeg", original: new Blob([new Uint8Array(1000)], { type: "image/jpeg" }), variants: { w256: new Blob(["s"], { type: "image/webp" }) },
  animated: false, phash: hash, palette: [{ hex: "#112233", weight: 1 }],
});

async function addAssets(...specs: Array<{ name: string; hash: string; w?: number; h?: number }>) {
  const uploader = new AssetUploader({
    doc: new BoardDoc(), resolver: new AssetResolverImpl({ publicHost: null }), localOnly: true,
    process: async (f) => { const s = specs.find((x) => x.name === (f as File).name)!; return processed(s.w ?? 800, s.h ?? 600, s.hash); },
  });
  const ids: string[] = [];
  for (const s of specs) ids.push(await uploader.addAssetOnly(new File([new Uint8Array(10)], s.name, { type: "image/jpeg" }), { name: s.name }));
  uploader.dispose();
  return ids;
}

describe("the local-only library", () => {
  it("lists the assets kept on this device, newest first, named after their files", async () => {
    const [a, b] = await addAssets({ name: "harbour.jpg", hash: "0000000000000000" }, { name: "pier.jpg", hash: "ffffffffffffffff", w: 1200, h: 900 });
    const api = createLocalLibraryApi({ boards: async () => [], boardAssets: async () => [] });
    const list = await api.list({ query: "", kind: null, sort: "recent", unused: false });
    expect(list.map((x) => x.id).sort()).toEqual([a, b].sort());
    const pier = list.find((x) => x.id === b)!;
    expect(pier).toMatchObject({ title: "pier.jpg", width: 1200, height: 900, kind: "image", usedIn: 0, boards: [], variants: ["w256"] });
  });

  it("counts the local boards that use an asset", async () => {
    const [a, b] = await addAssets({ name: "a.jpg", hash: "0000000000000000" }, { name: "b.jpg", hash: "ffffffffffffffff" });
    const api = createLocalLibraryApi({
      boards: async () => [{ id: "b1", title: "Harbour" }, { id: "b2", title: "Pier" }],
      boardAssets: async (id) => (id === "b1" ? [a] : [a, b]),
    });
    const list = await api.list({ query: "", kind: null, sort: "used", unused: false });
    expect(list[0]).toMatchObject({ id: a, usedIn: 2 });
    expect(list[0].boards.map((x) => x.title)).toEqual(["Harbour", "Pier"]);
    expect(list[1]).toMatchObject({ id: b, usedIn: 1 });
    expect((await api.list({ query: "", kind: null, sort: "recent", unused: true }))).toEqual([]);
  });

  it("filters by the search text with the same rule as the server", async () => {
    await addAssets({ name: "harbour.jpg", hash: "0000000000000000" }, { name: "pier.jpg", hash: "ffffffffffffffff" });
    const api = createLocalLibraryApi({ boards: async () => [], boardAssets: async () => [] });
    expect((await api.list({ query: "HARB", kind: null, sort: "recent", unused: false })).map((x) => x.title)).toEqual(["harbour.jpg"]);
  });

  it("finds duplicates from the stored hashes", async () => {
    const [a, b, c] = await addAssets({ name: "a.jpg", hash: "0000000000000000" }, { name: "b.jpg", hash: "000000000000000f" }, { name: "c.jpg", hash: "ffffffffffffffff" });
    const api = createLocalLibraryApi({ boards: async () => [], boardAssets: async () => [] });
    const groups = await api.duplicates();
    expect(groups).toHaveLength(1);
    expect([...groups[0].assetIds].sort()).toEqual([a, b].sort());
    expect(groups[0].assetIds).not.toContain(c);
    const list = await api.list({ query: "", kind: null, sort: "recent", unused: false });
    expect(list.find((x) => x.id === a)!.similarTo).toEqual([b]);
  });

  it("deletes an unused asset from this device and refuses one a board uses", async () => {
    const [a, b] = await addAssets({ name: "a.jpg", hash: "0000000000000000" }, { name: "b.jpg", hash: "ffffffffffffffff" });
    const api = createLocalLibraryApi({ boards: async () => [{ id: "b1", title: "Harbour" }], boardAssets: async () => [a] });
    expect(await api.remove(a)).toMatchObject({ ok: false, reason: "in-use" });
    expect(await api.remove(b)).toEqual({ ok: true });
    const list = await api.list({ query: "", kind: null, sort: "recent", unused: false });
    expect(list.map((x) => x.id)).toEqual([a]);
  });

  it("is empty, not an error, when nothing has been added", async () => {
    const api = createLocalLibraryApi({ boards: async () => [], boardAssets: async () => [] });
    expect(await api.list({ query: "", kind: null, sort: "recent", unused: false })).toEqual([]);
    expect(await api.duplicates()).toEqual([]);
  });
});

describe("the local-only library, reading real board documents", () => {
  it("finds the assets a board's stored document uses", async () => {
    const { IndexeddbPersistence } = await import("y-indexeddb");
    const Y = await import("yjs");
    const { defaultsFor } = await import("@/lib/engine/model/defaults");
    const [a, b] = await addAssets({ name: "a.jpg", hash: "0000000000000000" }, { name: "b.jpg", hash: "ffffffffffffffff" });
    const ydoc = new Y.Doc();
    const p = new IndexeddbPersistence("atelier-board-real-1", ydoc);
    await p.whenSynced;
    const doc = new BoardDoc(ydoc);
    doc.create({ ...defaultsFor("image"), assetId: a } as never);
    await new Promise((r) => setTimeout(r, 50));
    await p.destroy();

    const api = createLocalLibraryApi({ boards: async () => [{ id: "real-1", title: "Real" }, { id: "never-opened", title: "Missing" }] });
    const list = await api.list({ query: "", kind: null, sort: "recent", unused: false });
    expect(list.find((x) => x.id === a)).toMatchObject({ usedIn: 1, boards: [{ id: "real-1", title: "Real" }] });
    expect(list.find((x) => x.id === b)!.usedIn).toBe(0);
  });
});
