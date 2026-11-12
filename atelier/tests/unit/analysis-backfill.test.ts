import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureAnalysis, pendingAnalysisIds, scheduleAnalysis } from "@/lib/assets/backfill";
import { AssetMetaStore, type AssetMeta } from "@/lib/assets/meta-store";
import { AssetResolverImpl } from "@/lib/assets/resolver";

const ID = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f";
const ID2 = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e66";
const ID3 = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e77";
const PALETTE = [{ hex: "#dc1e28", weight: 1 }];
const meta = (id: string, over: Partial<AssetMeta> = {}): AssetMeta => ({
  id,
  kind: "image",
  width: 4000,
  height: 3000,
  bytes: 5,
  variants: ["w256", "w1024"],
  palette: null,
  phash: null,
  title: "",
  provenance: null,
  analysisVersion: 0,
  ...over,
});

type Fetched = { url: string; method: string; body?: unknown };
function setup(metas: AssetMeta[], over: { patchStatus?: number; imageStatus?: number; analyse?: (b: Blob) => Promise<{ palette: typeof PALETTE; phash: string }> } = {}) {
  const store = new AssetMetaStore({ persist: false });
  for (const m of metas) store.put(m);
  const resolver = new AssetResolverImpl({ publicHost: "img.example.com", meta: store });
  const calls: Fetched[] = [];
  const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET", body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    if (init?.method === "PATCH") return new Response(JSON.stringify({ ok: true }), { status: over.patchStatus ?? 200 });
    return new Response(new Blob(["img"], { type: "image/webp" }), { status: over.imageStatus ?? 200 });
  }) as unknown as typeof fetch;
  const analyse = vi.fn(over.analyse ?? (async () => ({ palette: PALETTE, phash: "0123456789abcdef" })));
  return { store, resolver, calls, fetchFn, analyse, deps: { resolver, meta: store, fetch: fetchFn, analyse } };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ensureAnalysis", () => {
  it("analyses the 256 px variant, PATCHes palette, hash and version, and updates the metadata store", async () => {
    const s = setup([meta(ID)]);
    const seen: string[][] = [];
    s.store.subscribe((ids) => seen.push(ids));
    await ensureAnalysis(ID, s.deps);
    expect(s.calls[0]).toMatchObject({ url: `https://img.example.com/a/${ID}/w256.webp`, method: "GET" });
    expect(s.analyse).toHaveBeenCalledTimes(1);
    expect(s.calls[1]).toMatchObject({ url: `/api/assets/${ID}`, method: "PATCH", body: { palette: PALETTE, phash: "0123456789abcdef", analysisVersion: 1 } });
    expect(s.store.get(ID)).toMatchObject({ palette: PALETTE, phash: "0123456789abcdef", analysisVersion: 1 });
    expect(seen.flat()).toContain(ID);
  });

  it("falls back to w1024 and then the original when there is no w256", async () => {
    const a = setup([meta(ID, { variants: ["w1024"] })]);
    await ensureAnalysis(ID, a.deps);
    expect(a.calls[0].url).toBe(`https://img.example.com/a/${ID}/w1024.webp`);
    const b = setup([meta(ID, { variants: [], width: 200, height: 100 })]);
    await ensureAnalysis(ID, b.deps);
    expect(b.calls[0].url).toBe(`https://img.example.com/a/${ID}/original`);
  });

  it("skips assets that were already analysed, videos and unknown assets", async () => {
    const s = setup([meta(ID, { analysisVersion: 1 }), meta(ID2, { kind: "video" })]);
    await ensureAnalysis(ID, s.deps);
    await ensureAnalysis(ID2, s.deps);
    await ensureAnalysis(ID3, s.deps);
    expect(s.fetchFn).not.toHaveBeenCalled();
    expect(s.analyse).not.toHaveBeenCalled();
  });

  it("is skipped while the browser is offline", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const s = setup([meta(ID)]);
    await ensureAnalysis(ID, s.deps);
    expect(s.fetchFn).not.toHaveBeenCalled();
    expect(s.store.get(ID)?.analysisVersion).toBe(0);
  });

  it("runs serially: never more than one analysis in flight, across callers", async () => {
    let inFlight = 0;
    let peak = 0;
    const s = setup([meta(ID), meta(ID2), meta(ID3)], {
      analyse: async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return { palette: PALETTE, phash: "0123456789abcdef" };
      },
    });
    await Promise.all([ensureAnalysis(ID, s.deps), ensureAnalysis(ID2, s.deps), ensureAnalysis(ID3, s.deps)]);
    expect(peak).toBe(1);
    expect(s.analyse).toHaveBeenCalledTimes(3);
  });

  it("an image that cannot be fetched throws and leaves the metadata as it was", async () => {
    const s = setup([meta(ID)], { imageStatus: 404 });
    await expect(ensureAnalysis(ID, s.deps)).rejects.toThrow(/404/);
    expect(s.store.get(ID)).toMatchObject({ palette: null, analysisVersion: 0 });
    expect(s.analyse).not.toHaveBeenCalled();
  });

  it("when the PATCH fails the colours are still kept locally (version stays 0) and the next call only retries the PATCH", async () => {
    const s = setup([meta(ID)], { patchStatus: 500 });
    await expect(ensureAnalysis(ID, s.deps)).rejects.toThrow(/500/);
    expect(s.store.get(ID)).toMatchObject({ palette: PALETTE, phash: "0123456789abcdef", analysisVersion: 0 });
    const before = s.calls.length;
    await expect(ensureAnalysis(ID, s.deps)).rejects.toThrow(/500/);
    expect(s.analyse).toHaveBeenCalledTimes(1); // not analysed again
    expect(s.calls.slice(before).map((c) => c.method)).toEqual(["PATCH"]); // and the image was not fetched again
  });

  it("an asset the server does not know yet (404) keeps its colours without throwing", async () => {
    const s = setup([meta(ID)], { patchStatus: 404 });
    await ensureAnalysis(ID, s.deps);
    expect(s.store.get(ID)).toMatchObject({ palette: PALETTE, analysisVersion: 0 });
  });

  it("local-only mode (the route answers 503) has no server to tell: the analysis counts as done", async () => {
    const s = setup([meta(ID)], { patchStatus: 503 });
    await ensureAnalysis(ID, s.deps);
    expect(s.store.get(ID)).toMatchObject({ palette: PALETTE, analysisVersion: 1 });
  });

  it("an image with no colours at all (fully transparent) is recorded as analysed with an empty palette", async () => {
    const s = setup([meta(ID)], { analyse: async () => ({ palette: [], phash: "0000000000000000" }) });
    await ensureAnalysis(ID, s.deps);
    expect(s.store.get(ID)).toMatchObject({ palette: [], analysisVersion: 1 });
    expect(s.calls.at(-1)?.body).toMatchObject({ palette: [], analysisVersion: 1 });
  });

  it("a failing analysis leaves the metadata alone", async () => {
    const s = setup([meta(ID)], {
      analyse: async () => {
        throw new Error("cannot decode");
      },
    });
    await expect(ensureAnalysis(ID, s.deps)).rejects.toThrow(/cannot decode/);
    expect(s.calls.some((c) => c.method === "PATCH")).toBe(false);
  });
});

describe("pendingAnalysisIds", () => {
  it("lists images whose analysis is not done, in the order given, once each", () => {
    const store = new AssetMetaStore({ persist: false });
    store.put(meta(ID));
    store.put(meta(ID2, { analysisVersion: 1 }));
    store.put(meta(ID3, { kind: "video" }));
    expect(pendingAnalysisIds(store, [ID3, ID, ID2, ID, "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4eee"])).toEqual([ID]);
  });
});

describe("scheduleAnalysis", () => {
  it("analyses the assets one after another, each when idle", async () => {
    const s = setup([meta(ID), meta(ID2)]);
    const idleCalls: number[] = [];
    const idle = (fn: () => void) => {
      idleCalls.push(s.analyse.mock.calls.length);
      queueMicrotask(fn);
    };
    const job = scheduleAnalysis([ID, ID2], s.deps, { idle });
    await job.finished;
    expect(idleCalls).toEqual([0, 1]); // each waited for idle before running, after the previous finished
    expect(s.store.get(ID)?.analysisVersion).toBe(1);
    expect(s.store.get(ID2)?.analysisVersion).toBe(1);
  });

  it("can be cancelled: nothing more runs", async () => {
    const s = setup([meta(ID), meta(ID2)]);
    let release: () => void = () => {};
    const idle = (fn: () => void) => {
      release = fn;
    };
    const job = scheduleAnalysis([ID, ID2], s.deps, { idle });
    job.cancel();
    release();
    await job.finished;
    expect(s.fetchFn).not.toHaveBeenCalled();
  });

  it("cancelling aborts the image download in flight", async () => {
    const store = new AssetMetaStore({ persist: false });
    store.put(meta(ID));
    const resolver = new AssetResolverImpl({ publicHost: "img.example.com", meta: store });
    let aborted = false;
    const fetchFn = vi.fn(
      (_u: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_res, rej) => {
          init?.signal?.addEventListener("abort", () => {
            aborted = true;
            rej(new DOMException("aborted", "AbortError"));
          });
        }),
    ) as unknown as typeof fetch;
    const errors: unknown[] = [];
    const job = scheduleAnalysis([ID], { resolver, meta: store, fetch: fetchFn, analyse: async () => ({ palette: PALETTE, phash: "0123456789abcdef" }) }, { idle: (fn) => queueMicrotask(fn), onError: (e) => errors.push(e) });
    await new Promise((r) => setTimeout(r, 10));
    job.cancel();
    await job.finished;
    expect(aborted).toBe(true);
    expect(errors).toEqual([]); // a cancelled job is not an error
    expect(store.get(ID)?.analysisVersion).toBe(0);
  });

  it("a failure goes to onError and the next asset still runs", async () => {
    const s = setup([meta(ID), meta(ID2)]);
    s.analyse.mockRejectedValueOnce(new Error("boom"));
    const errors: unknown[] = [];
    await scheduleAnalysis([ID, ID2], s.deps, { idle: (fn) => queueMicrotask(fn), onError: (e) => errors.push(e) }).finished;
    expect(errors).toHaveLength(1);
    expect(s.store.get(ID2)?.analysisVersion).toBe(1);
  });
});
