import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureVariants, scheduleBackfill } from "@/lib/assets/backfill";
import { AssetMetaStore, type AssetMeta } from "@/lib/assets/meta-store";
import { AssetResolverImpl } from "@/lib/assets/resolver";
import type { ProcessedImage } from "@/lib/assets/pipeline-core";
import type { VariantName } from "@/lib/assets/variants";

const ID = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f";
const ID2 = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e66";
const meta = (id: string, over: Partial<AssetMeta> = {}): AssetMeta => ({
  id,
  kind: "image",
  width: 4000,
  height: 3000,
  bytes: 5,
  variants: ["w1024"],
  palette: null,
  phash: null,
  title: "",
  provenance: null,
  analysisVersion: 0,
  ...over,
});

function setup(metas: AssetMeta[], over: { fetchStatus?: number; process?: (b: Blob) => Promise<ProcessedImage> } = {}) {
  const store = new AssetMetaStore({ persist: false });
  for (const m of metas) store.put(m);
  const resolver = new AssetResolverImpl({ publicHost: "img.example.com", meta: store });
  const uploads: { id: string; names: string[]; info: Record<string, unknown> }[] = [];
  const uploader = {
    uploadVariants: vi.fn(async (id: string, info: Record<string, unknown>, variants: Partial<Record<VariantName, Blob>>) => {
      uploads.push({ id, names: Object.keys(variants), info });
    }),
  };
  const fetchFn = vi.fn(async (url: string | URL | Request) => {
    if (over.fetchStatus && over.fetchStatus !== 200) return new Response("no", { status: over.fetchStatus });
    expect(String(url)).toMatch(/\/original$/);
    return new Response(new Blob(["original-bytes"], { type: "image/jpeg" }));
  }) as unknown as typeof fetch;
  const process =
    over.process ??
    vi.fn(async () => ({
      width: 4000,
      height: 3000,
      mime: "image/jpeg",
      original: new Blob(["o"]),
      variants: { w256: new Blob(["a"], { type: "image/webp" }), w1024: new Blob(["b"], { type: "image/webp" }), w2048: new Blob(["c"], { type: "image/webp" }) },
      animated: false,
    }));
  return { store, resolver, uploader, uploads, fetchFn, process, deps: { resolver, uploader, fetch: fetchFn, process } };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ensureVariants", () => {
  it("generates and uploads the missing w256 and w2048 for a Phase 1 asset, once", async () => {
    const s = setup([meta(ID)]);
    await ensureVariants(ID, s.deps);
    expect(s.uploads).toHaveLength(1);
    expect(s.uploads[0].id).toBe(ID);
    expect(s.uploads[0].names.sort()).toEqual(["w2048", "w256"]); // not w1024: it exists
    expect(s.uploads[0].info).toMatchObject({ mime: "image/jpeg", width: 4000, height: 3000, kind: "image" });
    expect(s.resolver.available(ID)?.variants).toEqual(["w256", "w1024", "w2048"]);

    await ensureVariants(ID, s.deps); // second time: nothing to do
    expect(s.uploads).toHaveLength(1);
    expect(s.fetchFn).toHaveBeenCalledTimes(1);
  });

  it("only makes the variants the plan allows (never upscales)", async () => {
    const s = setup([meta(ID, { width: 1500, height: 1000 })]);
    await ensureVariants(ID, s.deps);
    expect(s.uploads[0].names).toEqual(["w256"]);
    const tiny = setup([meta(ID, { width: 200, height: 100, variants: [] })]);
    await ensureVariants(ID, tiny.deps);
    expect(tiny.uploads).toHaveLength(0);
    expect(tiny.fetchFn).not.toHaveBeenCalled();
  });

  it("does nothing for an asset it knows nothing about, a complete asset, a video, or while offline", async () => {
    const s = setup([meta(ID, { variants: ["w256", "w1024", "w2048"] }), meta(ID2, { kind: "video" })]);
    await ensureVariants("6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4eff", s.deps);
    await ensureVariants(ID, s.deps);
    await ensureVariants(ID2, s.deps);
    expect(s.fetchFn).not.toHaveBeenCalled();

    const off = setup([meta(ID)]);
    vi.stubGlobal("navigator", { onLine: false });
    await ensureVariants(ID, off.deps);
    expect(off.fetchFn).not.toHaveBeenCalled();
  });

  it("rejects without touching the metadata when the original cannot be fetched or the upload fails", async () => {
    const s = setup([meta(ID)], { fetchStatus: 404 });
    await expect(ensureVariants(ID, s.deps)).rejects.toThrow();
    expect(s.resolver.available(ID)?.variants).toEqual(["w1024"]);

    const t = setup([meta(ID)]);
    t.uploader.uploadVariants.mockRejectedValueOnce(new Error("503"));
    await expect(ensureVariants(ID, t.deps)).rejects.toThrow();
    expect(t.resolver.available(ID)?.variants).toEqual(["w1024"]);
    await ensureVariants(ID, t.deps); // a later try works
    expect(t.resolver.available(ID)?.variants).toEqual(["w256", "w1024", "w2048"]);
  });

  it("runs one asset at a time, however many are asked for at once", async () => {
    let active = 0;
    let peak = 0;
    const s = setup([meta(ID), meta(ID2)]);
    s.uploader.uploadVariants.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    });
    await Promise.all([ensureVariants(ID, s.deps), ensureVariants(ID2, s.deps), ensureVariants(ID, s.deps)]);
    expect(peak).toBe(1);
    expect(s.uploader.uploadVariants).toHaveBeenCalledTimes(2); // the repeated id was already done by then
  });
});

describe("scheduleBackfill", () => {
  it("works through the ids on idle, swallows failures and can be cancelled", async () => {
    const s = setup([meta(ID), meta(ID2)]);
    s.uploader.uploadVariants.mockRejectedValueOnce(new Error("503"));
    const errors: unknown[] = [];
    const done = scheduleBackfill([ID, ID2], s.deps, { idle: (fn) => void Promise.resolve().then(fn), onError: (e) => errors.push(e) });
    await done.finished;
    expect(errors).toHaveLength(1);
    expect(s.resolver.available(ID2)?.variants).toEqual(["w256", "w1024", "w2048"]);

    const t = setup([meta(ID), meta(ID2)]);
    const c = scheduleBackfill([ID, ID2], t.deps, { idle: (fn) => void setTimeout(fn, 1) });
    c.cancel();
    await c.finished;
    expect(t.uploader.uploadVariants).not.toHaveBeenCalled();
  });
});
