import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalysisScheduler } from "@/lib/assets/analysis-scheduler";
import { AssetMetaStore, type AssetMeta } from "@/lib/assets/meta-store";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";

const A1 = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e91";
const A2 = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e92";
const A3 = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e93";
const meta = (id: string, over: Partial<AssetMeta> = {}): AssetMeta => ({
  id,
  kind: "image",
  width: 100,
  height: 100,
  bytes: 1,
  variants: ["w256", "w1024"],
  palette: null,
  phash: null,
  title: "",
  provenance: null,
  analysisVersion: 0,
  ...over,
});

function setup() {
  const doc = new BoardDoc();
  const store = new AssetMetaStore({ persist: false });
  const jobs: { ids: string[]; cancel: ReturnType<typeof vi.fn>; finish(e?: unknown): void }[] = [];
  const schedule = vi.fn((ids: string[], _deps: unknown, opts: { onError?: (e: unknown) => void } = {}) => {
    let finish!: () => void;
    const finished = new Promise<void>((r) => (finish = r));
    const job = { ids, cancel: vi.fn(), finish: (e?: unknown) => (e && opts.onError?.(e), finish()) };
    jobs.push(job);
    return { cancel: job.cancel, finished };
  });
  const scheduler = new AnalysisScheduler({ doc, meta: store, resolver: { url: () => null }, debounceMs: 20, schedule: schedule as never });
  const image = (assetId: string) => doc.create({ ...defaultsFor("image"), assetId, w: 10, h: 10 } as never);
  return { doc, store, scheduler, schedule, jobs, image };
}
afterEach(() => vi.useRealTimers());

describe("AnalysisScheduler", () => {
  it("schedules the board's images that have no analysis yet, once each", () => {
    const t = setup();
    t.store.put(meta(A1));
    t.store.put(meta(A2, { analysisVersion: 1, palette: [{ hex: "#ffffff", weight: 1 }] }));
    t.image(A1);
    t.image(A1);
    t.image(A2);
    t.scheduler.check();
    expect(t.schedule).toHaveBeenCalledTimes(1);
    expect(t.jobs[0].ids).toEqual([A1]);
    t.scheduler.check(); // already queued
    expect(t.schedule).toHaveBeenCalledTimes(1);
  });

  it("ignores videos and assets whose metadata is not known yet", () => {
    const t = setup();
    t.store.put(meta(A1, { kind: "video" }));
    t.image(A1);
    t.image(A2);
    t.scheduler.check();
    expect(t.schedule).not.toHaveBeenCalled();
  });

  it("picks up new images and arriving metadata after a quiet moment", () => {
    vi.useFakeTimers();
    const t = setup();
    t.scheduler.start();
    vi.advanceTimersByTime(100);
    expect(t.schedule).not.toHaveBeenCalled();
    t.image(A1);
    t.store.put(meta(A1));
    t.image(A2);
    vi.advanceTimersByTime(10);
    expect(t.schedule).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(t.schedule).toHaveBeenCalledTimes(1);
    t.store.put(meta(A2)); // its metadata arrives later
    vi.advanceTimersByTime(50);
    expect(t.schedule).toHaveBeenCalledTimes(2);
    expect(t.jobs[1].ids).toEqual([A2]);
    t.scheduler.stop();
  });

  it("does not run again for an image whose analysis failed in this session", async () => {
    vi.useFakeTimers();
    const t = setup();
    t.store.put(meta(A1));
    t.image(A1);
    t.scheduler.check();
    t.jobs[0].finish(new Error("boom"));
    await vi.advanceTimersByTimeAsync(0);
    t.scheduler.check();
    expect(t.schedule).toHaveBeenCalledTimes(1);
  });

  it("retries one that was skipped without an error (offline) at the next check", async () => {
    vi.useFakeTimers();
    const t = setup();
    t.store.put(meta(A1));
    t.image(A1);
    t.scheduler.check();
    t.jobs[0].finish();
    await vi.advanceTimersByTimeAsync(0);
    t.scheduler.check();
    expect(t.schedule).toHaveBeenCalledTimes(2);
  });

  it("stop() cancels what is running and stops listening", () => {
    vi.useFakeTimers();
    const t = setup();
    t.store.put(meta(A1));
    t.image(A1);
    t.scheduler.start();
    vi.advanceTimersByTime(100);
    expect(t.jobs).toHaveLength(1);
    t.scheduler.stop();
    expect(t.jobs[0].cancel).toHaveBeenCalled();
    t.store.put(meta(A3));
    t.image(A3);
    vi.advanceTimersByTime(200);
    expect(t.schedule).toHaveBeenCalledTimes(1);
  });
});
