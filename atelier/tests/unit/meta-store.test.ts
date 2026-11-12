import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssetMetaStore, type AssetMeta } from "@/lib/assets/meta-store";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

const meta = (id: string, over: Partial<AssetMeta> = {}): AssetMeta => ({
  id,
  kind: "image",
  width: 4000,
  height: 3000,
  bytes: 123,
  variants: ["w256", "w1024", "w2048"],
  palette: null,
  phash: null,
  title: "",
  provenance: null,
  analysisVersion: 0,
  ...over,
});

describe("AssetMetaStore", () => {
  it("put / get / getMany", () => {
    const s = new AssetMetaStore({ persist: false });
    expect(s.get("a")).toBeUndefined();
    s.put(meta("a"));
    s.put(meta("b", { width: 10 }));
    expect(s.get("a")?.width).toBe(4000);
    const many = s.getMany(["a", "b", "zzz"]);
    expect([...many.keys()].sort()).toEqual(["a", "b"]);
    expect(many.get("b")?.width).toBe(10);
  });

  it("subscribers hear the ids that changed, and can unsubscribe", () => {
    const s = new AssetMetaStore({ persist: false });
    const seen: string[][] = [];
    const off = s.subscribe((ids) => seen.push(ids));
    s.put(meta("a"));
    s.put(meta("b"));
    off();
    s.put(meta("c"));
    expect(seen).toEqual([["a"], ["b"]]);
  });

  it("an identical put does not notify", () => {
    const s = new AssetMetaStore({ persist: false });
    const cb = vi.fn();
    s.put(meta("a"));
    s.subscribe(cb);
    s.put(meta("a"));
    expect(cb).not.toHaveBeenCalled();
    s.put(meta("a", { title: "x" }));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("persists to IndexedDB `atelier-assets` and hydrates a fresh store from it", async () => {
    const a = new AssetMetaStore({ dbName: "atelier-assets" });
    a.put(meta("a", { palette: [{ hex: "#112233", weight: 1 }], variants: ["w256"] }));
    a.put(meta("b"));
    await a.flush();

    const b = new AssetMetaStore({ dbName: "atelier-assets" });
    expect(b.get("a")).toBeUndefined();
    const seen: string[][] = [];
    b.subscribe((ids) => seen.push(ids));
    await b.hydrate();
    expect(b.get("a")).toMatchObject({ variants: ["w256"], palette: [{ hex: "#112233", weight: 1 }] });
    expect(b.get("b")?.id).toBe("b");
    expect(seen.flat().sort()).toEqual(["a", "b"]);
  });

  it("hydrate never overwrites newer in-memory data", async () => {
    const a = new AssetMetaStore({ dbName: "atelier-assets-h" });
    a.put(meta("a", { title: "old" }));
    await a.flush();
    const b = new AssetMetaStore({ dbName: "atelier-assets-h" });
    b.put(meta("a", { title: "new" }));
    await b.hydrate();
    expect(b.get("a")?.title).toBe("new");
  });

  it("works (in memory) when IndexedDB is unavailable", async () => {
    const real = globalThis.indexedDB;
    // @ts-expect-error simulate a browser without IndexedDB
    globalThis.indexedDB = undefined;
    try {
      const s = new AssetMetaStore();
      s.put(meta("a"));
      await s.flush();
      await s.hydrate();
      expect(s.get("a")?.id).toBe("a");
    } finally {
      globalThis.indexedDB = real;
    }
  });

  it("ignores malformed rows on hydrate", async () => {
    const s = new AssetMetaStore({ dbName: "atelier-assets-bad" });
    await s.hydrate(); // creates the database
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open("atelier-assets-bad", 1);
      req.onsuccess = () => resolve(req.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("assets", "readwrite");
      tx.objectStore("assets").put({ id: "x", width: "nope" });
      tx.objectStore("assets").put(meta("ok"));
      tx.oncomplete = () => resolve();
    });
    db.close();
    const fresh = new AssetMetaStore({ dbName: "atelier-assets-bad" });
    await fresh.hydrate();
    expect(fresh.get("x")).toBeUndefined();
    expect(fresh.get("ok")?.id).toBe("ok");
  });
});
