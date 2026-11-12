import { describe, expect, it } from "vitest";
import { AssetMetaStore, type AssetMeta } from "@/lib/assets/meta-store";
import { AssetResolverImpl } from "@/lib/assets/resolver";

const ID = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f";
const HOST = "img.example.com";
const remote = (v: string) => `https://${HOST}/a/${ID}/${v === "original" ? "original" : `${v}.webp`}`;

const meta = (over: Partial<AssetMeta> = {}): AssetMeta => ({
  id: ID,
  kind: "image",
  width: 4000,
  height: 3000,
  bytes: 1,
  variants: ["w256", "w1024", "w2048"],
  palette: null,
  phash: null,
  title: "",
  provenance: null,
  analysisVersion: 0,
  ...over,
});

function make(m?: AssetMeta) {
  const store = new AssetMetaStore({ persist: false });
  if (m) store.put(m);
  return { r: new AssetResolverImpl({ publicHost: HOST, meta: store }), store };
}

describe("AssetResolverImpl.url with variants", () => {
  it("serves each existing variant and the original from the public host", () => {
    const { r } = make(meta());
    for (const v of ["w256", "w1024", "w2048", "original"] as const) expect(r.url(ID, v)).toBe(remote(v));
  });

  it("w2048 falls back to w1024, then to the original, when the variant is absent", () => {
    const { r } = make(meta({ width: 1500, height: 1000, variants: ["w256", "w1024"] }));
    expect(r.url(ID, "w2048")).toBe(remote("w1024"));
    const small = make(meta({ width: 500, height: 300, variants: ["w256"] })).r;
    expect(small.url(ID, "w2048")).toBe(remote("original"));
    expect(small.url(ID, "w1024")).toBe(remote("original"));
    const tiny = make(meta({ width: 200, height: 100, variants: [] })).r;
    expect(tiny.url(ID, "w256")).toBe(remote("original"));
    expect(tiny.url(ID, "w2048")).toBe(remote("original"));
  });

  it("an asset nobody has metadata for is assumed to be a Phase 1 asset (w1024 and the original only)", () => {
    const { r } = make();
    expect(r.available(ID)).toBeNull();
    expect(r.url(ID, "w1024")).toBe(remote("w1024"));
    expect(r.url(ID, "w256")).toBe(remote("w1024"));
    expect(r.url(ID, "w2048")).toBe(remote("w1024"));
    expect(r.url(ID, "original")).toBe(remote("original"));
  });

  it("prefers a local blob for the variant, and falls back through local blobs too", () => {
    const { r } = make(meta({ width: 1500, height: 1000, variants: ["w256", "w1024"] }));
    r.registerLocal(ID, { w256: new Blob(["a"]), w1024: new Blob(["b"]), original: new Blob(["c"]) });
    expect(r.url(ID, "w256")).toMatch(/^blob:/);
    expect(r.url(ID, "w256")).not.toBe(r.url(ID, "w1024"));
    expect(r.url(ID, "w2048")).toBe(r.url(ID, "w1024")); // absent: next in the chain, still local
    r.forgetLocal(ID);
    expect(r.url(ID, "w256")).toBe(remote("w256"));
  });

  it("a local-only blob set (no remote host) still resolves through the chain", () => {
    const r = new AssetResolverImpl({ publicHost: null, meta: new AssetMetaStore({ persist: false }) });
    r.registerLocal(ID, { original: new Blob(["c"]) });
    expect(r.url(ID, "w1024")).toMatch(/^blob:/);
    expect(r.url(ID, "w256")).toBe(r.url(ID, "original"));
    expect(new AssetResolverImpl({ publicHost: null }).url(ID, "w256")).toBeNull();
  });

  it("refuses ids that are not asset ids", () => {
    const { r } = make();
    expect(r.url("../x", "w256")).toBeNull();
    expect(r.available("../x")).toBeNull();
  });
});

describe("AssetResolverImpl.available", () => {
  it("reports variants and size from the metadata store", () => {
    const { r, store } = make(meta({ variants: ["w256", "w1024"], width: 1500, height: 1000 }));
    expect(r.available(ID)).toEqual({ variants: ["w256", "w1024"], width: 1500, height: 1000 });
    store.put(meta({ variants: ["w256", "w1024", "w2048"], width: 4000, height: 3000 }));
    expect(r.available(ID)?.variants).toEqual(["w256", "w1024", "w2048"]);
  });

  it("includes a local pending upload described by registerLocal", () => {
    const { r } = make();
    r.registerLocal(
      ID,
      { w256: new Blob(["a"]), original: new Blob(["c"]) },
      { kind: "image", width: 800, height: 600, bytes: 9, variants: ["w256"], mime: "image/png" },
    );
    expect(r.available(ID)).toEqual({ variants: ["w256"], width: 800, height: 600 });
    r.forgetLocal(ID);
    expect(r.available(ID)).toEqual({ variants: ["w256"], width: 800, height: 600 }); // metadata outlives the blobs
  });

  it("remember() adds metadata that other code learned (a duplicate, a server hydrate)", () => {
    const { r, store } = make();
    r.remember(meta({ variants: ["w256"], width: 300, height: 300 }));
    expect(store.get(ID)?.variants).toEqual(["w256"]);
    expect(r.available(ID)?.width).toBe(300);
  });
});
