import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssetMetaStore } from "@/lib/assets/meta-store";
import { AssetResolverImpl } from "@/lib/assets/resolver";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { estimateMeasurer } from "@/lib/engine/export/export-api";
import { PREVIEW_MAX_FRAMES, PublishError, publishRoundFlow, renderFramePreviews, type RoundsApi } from "@/lib/engine/export/preview";
import { ExportCancelled } from "@/lib/engine/export/protocol";
import { boardDocSource } from "@/lib/engine/export/scene";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";
import type { Round } from "@/lib/share/round-types";

const resolver = new AssetResolverImpl({ publicHost: "img.example.com", meta: new AssetMetaStore({ persist: false }) });

/** A frame with one shape in it (so it has something to render). */
function addFrame(doc: BoardDoc, name: string, order: string, x: number, opts: { empty?: boolean } = {}): string {
  const f = doc.create({ ...defaultsFor("frame"), name, order, x, y: 0, w: 1920, h: 1080 } as unknown as NewObject);
  if (!opts.empty) doc.create({ ...defaultsFor("shape"), x: x + 100, y: 100, w: 300, h: 200, fill: "#336699", parentId: f } as unknown as NewObject);
  return f;
}

class FakeManager {
  runs: { widthPx: number; scale: number; quality: number; format: string; width: number }[] = [];
  failWidth = new Set<number>();
  failAt = new Set<number>(); // call numbers that reject
  calls = 0;
  cancelled = 0;
  run(_kind: string, payload: unknown) {
    const p = payload as { scene: { width: number }; options: { scale: number; quality: number; format: string } };
    this.calls++;
    const n = this.calls;
    this.runs.push({ widthPx: Math.round(p.scene.width * p.options.scale), scale: p.options.scale, quality: p.options.quality, format: p.options.format, width: p.scene.width });
    const promise = this.failAt.has(n)
      ? Promise.reject(new Error("render failed"))
      : Promise.resolve({ blob: new Blob([`w${Math.round(p.scene.width * p.options.scale)}`], { type: "image/webp" }), summary: { failedAssets: [], substitutedFonts: [], warnings: [] } });
    return { promise, cancel: () => void this.cancelled++ };
  }
}

const deps = (m: FakeManager, signal = new AbortController().signal, onProgress = vi.fn()) => ({ exporter: m, assets: resolver, signal, onProgress, measure: estimateMeasurer });

describe("renderFramePreviews", () => {
  let doc: BoardDoc;
  beforeEach(() => {
    doc = new BoardDoc();
  });

  it("renders each frame at 1280 and 480 wide as WebP q 0.82, in slide order (not z-order)", async () => {
    const hero = addFrame(doc, "Hero", "b0", 4000);
    const intro = addFrame(doc, "Intro", "a0", 0);
    const m = new FakeManager();
    const out = await renderFramePreviews(boardDocSource(doc), deps(m));
    expect(out.frames.map((f) => f.frameId)).toEqual([intro, hero]);
    expect(out.frames[0]).toMatchObject({ name: "Intro", w: 1280, h: 720 });
    expect(m.runs.map((r) => r.widthPx)).toEqual([1280, 480, 1280, 480]);
    expect(m.runs.every((r) => r.format === "webp" && r.quality === 0.82)).toBe(true);
    expect(await out.frames[0].w1280.text()).toBe("w1280");
    expect(await out.frames[0].w480.text()).toBe("w480");
    expect(out.failedFrames).toEqual([]);
  });

  it("a frame with nothing to show gets no preview and is not a failure", async () => {
    const a = addFrame(doc, "Full", "a0", 0);
    addFrame(doc, "Blank", "b0", 3000, { empty: true });
    const out = await renderFramePreviews(boardDocSource(doc), deps(new FakeManager()));
    expect(out.frames.map((f) => f.frameId)).toEqual([a]);
    expect(out.failedFrames).toEqual([]);
    expect(out.emptyFrames).toHaveLength(1);
  });

  it("a frame whose render throws is reported and skipped; the rest still come back", async () => {
    const a = addFrame(doc, "A", "a0", 0);
    const b = addFrame(doc, "B", "b0", 3000);
    const c = addFrame(doc, "C", "c0", 6000);
    const m = new FakeManager();
    m.failAt.add(3); // the first render of the second frame
    const out = await renderFramePreviews(boardDocSource(doc), deps(m));
    expect(out.frames.map((f) => f.frameId)).toEqual([a, c]);
    expect(out.failedFrames).toEqual([b]);
  });

  it("aborting stops further frames and rejects with ExportCancelled", async () => {
    for (let i = 0; i < 4; i++) addFrame(doc, `F${i}`, `a${i}`, i * 3000);
    const m = new FakeManager();
    const ac = new AbortController();
    const onProgress = vi.fn((_r: number, label: string) => {
      if (label.includes("F1")) ac.abort();
    });
    await expect(renderFramePreviews(boardDocSource(doc), deps(m, ac.signal, onProgress))).rejects.toBeInstanceOf(ExportCancelled);
    expect(m.calls).toBeLessThan(8);
  });

  it("an already aborted signal renders nothing", async () => {
    addFrame(doc, "A", "a0", 0);
    const m = new FakeManager();
    const ac = new AbortController();
    ac.abort();
    await expect(renderFramePreviews(boardDocSource(doc), deps(m, ac.signal))).rejects.toBeInstanceOf(ExportCancelled);
    expect(m.calls).toBe(0);
  });

  it("reports progress from 0 to 1 with the frame being rendered", async () => {
    addFrame(doc, "A", "a0", 0);
    addFrame(doc, "B", "b0", 3000);
    const onProgress = vi.fn();
    await renderFramePreviews(boardDocSource(doc), deps(new FakeManager(), undefined, onProgress));
    const ratios = onProgress.mock.calls.map((c) => c[0] as number);
    expect(ratios[0]).toBe(0);
    expect(ratios.at(-1)).toBe(1);
    expect([...ratios].sort((x, y) => x - y)).toEqual(ratios);
    expect(onProgress.mock.calls.some((c) => String(c[1]).includes("B"))).toBe(true);
  });

  it("with more than 100 frames, renders the first 100 and says so", async () => {
    for (let i = 0; i < PREVIEW_MAX_FRAMES + 2; i++) doc.create({ ...defaultsFor("frame"), name: `F${i}`, order: `a${String(i).padStart(4, "0")}`, x: i * 100, y: 0, w: 50, h: 50, background: "#ffffff" } as unknown as NewObject);
    const m = new FakeManager();
    const out = await renderFramePreviews(boardDocSource(doc), deps(m));
    expect(out.frames).toHaveLength(PREVIEW_MAX_FRAMES);
    expect(out.warnings.join(" ")).toMatch(/first 100/);
  });
});

// ---- the whole flow ----------------------------------------------------------------------------------------

function api(over: Partial<RoundsApi> = {}): RoundsApi & { created: unknown[]; prepared: unknown[] } {
  const created: unknown[] = [];
  const prepared: unknown[] = [];
  return {
    created,
    prepared,
    async prepare(_board, frames) {
      prepared.push(frames);
      return { previewToken: "t".repeat(22), uploads: Object.fromEntries(frames.map((f) => [f.frameId, { w480: `https://r2/${f.frameId}-480`, w1280: `https://r2/${f.frameId}-1280` }])) };
    },
    async create(board, body) {
      created.push(body);
      const round: Round = { id: "r1", boardId: board, number: 1, label: body.label, snapshotId: "s1", previews: {}, diff: { added: [], removed: [], changed: [], byFrame: {}, truncated: false }, publishedAt: "2026-11-12T00:00:00Z" };
      return round;
    },
    ...over,
  };
}

describe("publishRoundFlow", () => {
  let doc: BoardDoc;
  let order: string[];
  beforeEach(() => {
    doc = new BoardDoc();
    order = [];
  });
  const flowDeps = (a: ReturnType<typeof api>, m: FakeManager, over: Record<string, unknown> = {}) => ({
    boardId: "b1",
    doc,
    sync: { flush: async () => void order.push("flush"), status: "saved" as const },
    api: { prepare: (...x: Parameters<RoundsApi["prepare"]>) => (order.push("prepare"), a.prepare(...x)), create: (...x: Parameters<RoundsApi["create"]>) => (order.push("create"), a.create(...x)) },
    exporter: m,
    assets: resolver,
    measure: estimateMeasurer,
    upload: async (url: string) => void order.push(`upload ${url}`),
    ...over,
  });

  it("flushes sync before anything else, then renders, prepares, uploads and creates", async () => {
    const f = addFrame(doc, "A", "a0", 0);
    const a = api();
    const m = new FakeManager();
    const round = await publishRoundFlow(flowDeps(a, m), "Direction A", new AbortController().signal, vi.fn());
    expect(order[0]).toBe("flush");
    expect(order.indexOf("prepare")).toBeLessThan(order.findIndex((o) => o.startsWith("upload")));
    expect(order.at(-1)).toBe("create");
    expect(order.filter((o) => o.startsWith("upload"))).toHaveLength(2);
    expect(m.calls).toBe(2);
    expect(a.created[0]).toMatchObject({ label: "Direction A", previewToken: "t".repeat(22), frames: [{ frameId: f, name: "A", w: 1280, h: 720 }] });
    expect(round.warnings).toEqual([]);
    expect(round.id).toBe("r1");
  });

  it("declares the real byte sizes to prepare", async () => {
    addFrame(doc, "A", "a0", 0);
    const a = api();
    await publishRoundFlow(flowDeps(a, new FakeManager()), "x", new AbortController().signal, vi.fn());
    expect(a.prepared[0]).toEqual([expect.objectContaining({ bytes1280: 5, bytes480: 4 })]); // "w1280" / "w480"
  });

  it("with every preview failing it still creates the round, with no frames, and says so", async () => {
    addFrame(doc, "A", "a0", 0);
    addFrame(doc, "B", "b0", 3000);
    const a = api();
    const m = new FakeManager();
    for (let i = 1; i <= 8; i++) m.failAt.add(i);
    const round = await publishRoundFlow(flowDeps(a, m), "x", new AbortController().signal, vi.fn());
    expect(a.created).toHaveLength(1);
    expect(a.created[0]).toMatchObject({ previewToken: null, frames: [] });
    expect(round.warnings.join(" ")).toMatch(/without preview images/i);
    expect(order).not.toContain("prepare");
  });

  it("one failing preview publishes the round with a null preview for that frame and a warning", async () => {
    const A = addFrame(doc, "A", "a0", 0);
    addFrame(doc, "B", "b0", 3000);
    const a = api();
    const m = new FakeManager();
    m.failAt.add(3);
    const round = await publishRoundFlow(flowDeps(a, m), "x", new AbortController().signal, vi.fn());
    expect((a.created[0] as { frames: { frameId: string }[] }).frames.map((f) => f.frameId)).toEqual([A]);
    expect(round.warnings.join(" ")).toMatch(/B/);
  });

  it("when prepare fails the round is still published, without previews", async () => {
    addFrame(doc, "A", "a0", 0);
    const a = api({ prepare: async () => { throw new Error("503"); } });
    const round = await publishRoundFlow(flowDeps(a, new FakeManager()), "x", new AbortController().signal, vi.fn());
    expect(a.created[0]).toMatchObject({ previewToken: null, frames: [] });
    expect(round.warnings.join(" ")).toMatch(/without preview images/i);
  });

  it("an upload that keeps failing drops only that frame; each upload is retried twice", async () => {
    const A = addFrame(doc, "A", "a0", 0);
    const B = addFrame(doc, "B", "b0", 3000);
    const a = api();
    const attempts: Record<string, number> = {};
    const upload = async (url: string) => {
      attempts[url] = (attempts[url] ?? 0) + 1;
      if (url.includes(`${B}-1280`)) throw new Error("network");
    };
    const round = await publishRoundFlow(flowDeps(a, new FakeManager(), { upload, retryDelayMs: 0 }), "x", new AbortController().signal, vi.fn());
    expect(attempts[`https://r2/${B}-1280`]).toBe(3);
    expect((a.created[0] as { frames: { frameId: string }[] }).frames.map((f) => f.frameId)).toEqual([A]);
    expect(round.warnings.join(" ")).toMatch(/B/);
  });

  it("uploads at most four at a time", async () => {
    for (let i = 0; i < 5; i++) addFrame(doc, `F${i}`, `a${i}`, i * 3000);
    let running = 0;
    let peak = 0;
    const upload = async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
    };
    await publishRoundFlow(flowDeps(api(), new FakeManager(), { upload }), "x", new AbortController().signal, vi.fn());
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });

  it("refuses to publish while the board is not saved on the server (the round would freeze stale state)", async () => {
    addFrame(doc, "A", "a0", 0);
    const a = api();
    await expect(publishRoundFlow(flowDeps(a, new FakeManager(), { sync: { flush: async () => {}, status: "offline" } }), "x", new AbortController().signal, vi.fn())).rejects.toMatchObject({ code: "not-synced" });
    expect(a.created).toEqual([]);
  });

  it("cancelling before the round is created creates nothing", async () => {
    addFrame(doc, "A", "a0", 0);
    const a = api();
    const ac = new AbortController();
    const upload = async () => ac.abort();
    await expect(publishRoundFlow(flowDeps(a, new FakeManager(), { upload }), "x", ac.signal, vi.fn())).rejects.toBeInstanceOf(PublishError);
    expect(a.created).toEqual([]);
  });

  it("a board with no frames publishes with no previews and no warning", async () => {
    doc.create({ ...defaultsFor("shape"), x: 1, y: 1 } as unknown as NewObject);
    const a = api();
    const round = await publishRoundFlow(flowDeps(a, new FakeManager()), "x", new AbortController().signal, vi.fn());
    expect(a.created[0]).toMatchObject({ previewToken: null, frames: [] });
    expect(round.warnings).toEqual([]);
    expect(order).not.toContain("prepare");
  });

  it("the create call's own failure is the publish's failure", async () => {
    addFrame(doc, "A", "a0", 0);
    const a = api({ create: async () => { throw new PublishError("server", "Could not publish"); } });
    await expect(publishRoundFlow(flowDeps(a, new FakeManager()), "x", new AbortController().signal, vi.fn())).rejects.toMatchObject({ code: "server" });
  });
});
