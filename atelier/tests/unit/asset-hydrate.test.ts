import { describe, expect, it, vi } from "vitest";
import { AssetMetaStore } from "@/lib/assets/meta-store";
import { hydrateBoardAssets } from "@/lib/assets/hydrate";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";

const id = (n: number) => `6f1c2d3e-4b5a-4c6d-8e7f-${String(n).padStart(12, "0")}`;
const img = (n: number) => ({ ...defaultsFor("image"), id: `o${n}`, assetId: id(n), w: 100, h: 100 }) as NewObject;
const row = (n: number) => ({ id: id(n), kind: "image", width: 4000, height: 3000, bytes: 9, variants: ["w256", "w1024"], palette: [], phash: null, title: "", analysisVersion: 0 });
const ok = (assets: unknown[]) => new Response(JSON.stringify({ assets }), { status: 200 });

describe("hydrateBoardAssets", () => {
  it("asks only for assets the store does not know, and stores the answer", async () => {
    const doc = new BoardDoc();
    doc.createMany([img(1), img(2), img(3)]);
    const meta = new AssetMetaStore({ persist: false });
    meta.put({ ...row(1), palette: null, provenance: null, analysisVersion: 0 } as never);
    const fetchFn = vi.fn(async (url: string) => ok([row(2), row(3)].filter((r) => url.includes(r.id)))) as unknown as typeof fetch;
    await hydrateBoardAssets({ doc, meta, fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const url = (fetchFn as unknown as { mock: { calls: string[][] } }).mock.calls[0][0];
    expect(url).toContain(id(2));
    expect(url).toContain(id(3));
    expect(url).not.toContain(id(1));
    expect(meta.get(id(2))).toMatchObject({ width: 4000, height: 3000, variants: ["w256", "w1024"] });
    expect(meta.get(id(3))).toBeDefined();
  });

  it("makes no request when everything is known", async () => {
    const doc = new BoardDoc();
    doc.create(img(1));
    const meta = new AssetMetaStore({ persist: false });
    meta.put({ ...row(1), palette: null, provenance: null } as never);
    const fetchFn = vi.fn();
    await hydrateBoardAssets({ doc, meta, fetchFn: fetchFn as unknown as typeof fetch });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("splits a big board into requests of at most 100 ids", async () => {
    const doc = new BoardDoc();
    doc.createMany(Array.from({ length: 250 }, (_, i) => img(i + 1)));
    const meta = new AssetMetaStore({ persist: false });
    const fetchFn = vi.fn(async () => ok([])) as unknown as typeof fetch;
    await hydrateBoardAssets({ doc, meta, fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("survives a failing network, a bad status and garbage", async () => {
    const doc = new BoardDoc();
    doc.createMany([img(1), img(2)]);
    const meta = new AssetMetaStore({ persist: false });
    for (const f of [
      async () => {
        throw new Error("offline");
      },
      async () => new Response("no", { status: 500 }),
      async () => new Response("not json", { status: 200 }),
      async () => ok([{ id: id(1), width: "wide" }, null, 5]),
    ]) {
      await expect(hydrateBoardAssets({ doc, meta, fetchFn: f as unknown as typeof fetch })).resolves.toBeUndefined();
    }
    expect(meta.get(id(1))).toBeUndefined();
  });

  it("does nothing in local-only mode", async () => {
    const doc = new BoardDoc();
    doc.create(img(1));
    const fetchFn = vi.fn();
    await hydrateBoardAssets({ doc, meta: new AssetMetaStore({ persist: false }), fetchFn: fetchFn as unknown as typeof fetch, localOnly: true });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
