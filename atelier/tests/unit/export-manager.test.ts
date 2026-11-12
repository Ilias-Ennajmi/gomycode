import { describe, expect, it, vi } from "vitest";
import { ExportCancelled, ExportManager, type WorkerIn, type WorkerOut } from "@/lib/engine/export/manager";

class FakeWorker {
  private handler: ((e: MessageEvent<WorkerOut>) => void) | null = null;
  // A real worker says it is ready once its own handler is installed; the fake does so once the manager has attached its own.
  set onmessage(fn: ((e: MessageEvent<WorkerOut>) => void) | null) {
    this.handler = fn;
    if (fn && this.announce) queueMicrotask(() => this.emit({ type: "ready" }));
  }
  get onmessage() {
    return this.handler;
  }
  constructor(private readonly announce = true) {}
  onerror: ((e: ErrorEvent) => void) | null = null;
  sent: WorkerIn[] = [];
  terminated = false;
  postMessage(m: WorkerIn) {
    this.sent.push(m);
  }
  terminate() {
    this.terminated = true;
  }
  emit(m: WorkerOut) {
    this.onmessage?.({ data: m } as MessageEvent<WorkerOut>);
  }
}
const summary = { failedAssets: [], substitutedFonts: [], warnings: [] };
const tick = () => new Promise((r) => setTimeout(r, 0));
const idOf = (m: WorkerIn | undefined) => (m as { id: string }).id;

describe("ExportManager", () => {
  it("runs jobs one at a time, in order, forwarding progress", async () => {
    const w = new FakeWorker();
    const m = new ExportManager({ createWorker: () => w as unknown as Worker });
    const seen: number[] = [];
    const a = m.run("raster", { n: 1 }, (r) => seen.push(r));
    const b = m.run("svg", { n: 2 }, () => {});
    await tick();
    expect(w.sent).toHaveLength(1); // the second waits
    const first = w.sent[0] as Extract<WorkerIn, { type: "start" }>;
    expect(first.kind).toBe("raster");
    w.emit({ type: "progress", id: first.id, ratio: 0.5, label: "half" });
    expect(seen).toEqual([0.5]);
    w.emit({ type: "done", id: first.id, blob: new Blob(["x"]), summary });
    await expect(a.promise).resolves.toMatchObject({ summary });
    await tick();
    expect(w.sent).toHaveLength(2);
    expect((w.sent[1] as Extract<WorkerIn, { type: "start" }>).kind).toBe("svg");
    w.emit({ type: "done", id: (w.sent[1] as { id: string }).id, blob: new Blob(["y"]), summary });
    await b.promise;
  });

  it("cancels a running job: posts cancel, terminates the worker within 200 ms and rejects with ExportCancelled", async () => {
    const w = new FakeWorker();
    const m = new ExportManager({ createWorker: () => w as unknown as Worker });
    const job = m.run("raster", {}, () => {});
    await tick();
    const t0 = Date.now();
    job.cancel();
    expect(w.sent.at(-1)).toMatchObject({ type: "cancel" });
    await expect(job.promise).rejects.toBeInstanceOf(ExportCancelled);
    expect(Date.now() - t0).toBeLessThan(200);
    expect(w.terminated).toBe(true);
  });

  it("rejects early with ExportCancelled when the worker answers the cancel with AbortError", async () => {
    const w = new FakeWorker();
    const m = new ExportManager({ createWorker: () => w as unknown as Worker });
    const job = m.run("raster", {}, () => {});
    await tick();
    const id = (w.sent[0] as { id: string }).id;
    job.cancel();
    w.emit({ type: "error", id, name: "AbortError", message: "Aborted" });
    await expect(job.promise).rejects.toBeInstanceOf(ExportCancelled);
    expect(w.terminated).toBe(false); // the worker is kept for the next job
  });

  it("cancels a queued job without touching the worker, and starts the next", async () => {
    const w = new FakeWorker();
    const m = new ExportManager({ createWorker: () => w as unknown as Worker });
    const a = m.run("raster", {}, () => {});
    const b = m.run("raster", {}, () => {});
    const c = m.run("svg", {}, () => {});
    await tick();
    b.cancel();
    await expect(b.promise).rejects.toBeInstanceOf(ExportCancelled);
    w.emit({ type: "done", id: (w.sent[0] as { id: string }).id, blob: new Blob(), summary });
    await a.promise;
    await tick();
    expect(w.sent.filter((s) => s.type === "start")).toHaveLength(2);
    expect((w.sent[1] as Extract<WorkerIn, { type: "start" }>).kind).toBe("svg");
    w.emit({ type: "done", id: (w.sent[1] as { id: string }).id, blob: new Blob(), summary });
    await c.promise;
  });

  it("starts a fresh worker after one was terminated", async () => {
    const made: FakeWorker[] = [];
    const m = new ExportManager({ createWorker: () => { const w = new FakeWorker(); made.push(w); return w as unknown as Worker; } });
    const a = m.run("raster", {}, () => {});
    await tick();
    a.cancel();
    await expect(a.promise).rejects.toBeInstanceOf(ExportCancelled);
    const b = m.run("raster", {}, () => {});
    await tick();
    expect(made).toHaveLength(2);
    made[1].emit({ type: "done", id: (made[1].sent[0] as { id: string }).id, blob: new Blob(), summary });
    await b.promise;
  });

  it("rejects with the worker's message on an error, and readably on a crash", async () => {
    const w = new FakeWorker();
    const m = new ExportManager({ createWorker: () => w as unknown as Worker });
    const a = m.run("raster", {}, () => {});
    await tick();
    w.emit({ type: "error", id: (w.sent[0] as { id: string }).id, message: "Out of memory" });
    await expect(a.promise).rejects.toThrow("Out of memory");
    const b = m.run("raster", {}, () => {});
    await tick();
    w.onerror?.({ message: "boom" } as ErrorEvent);
    await expect(b.promise).rejects.toThrow("boom");
  });

  it("holds the job back until the worker says it is ready, then starts it", async () => {
    const w = new FakeWorker(false);
    const m = new ExportManager({ createWorker: () => w as unknown as Worker });
    const a = m.run("raster", {}, () => {});
    await tick();
    expect(w.sent).toHaveLength(0); // a worker that is still loading would lose the message
    w.emit({ type: "ready" });
    expect(w.sent).toHaveLength(1);
    w.emit({ type: "done", id: idOf(w.sent[0]), blob: new Blob(), summary });
    await a.promise;
  });

  it("gives up on a worker that never becomes ready, with a readable message", async () => {
    vi.useFakeTimers();
    try {
      const w = new FakeWorker(false);
      const m = new ExportManager({ createWorker: () => w as unknown as Worker });
      const a = m.run("raster", {}, () => {});
      const caught = a.promise.catch((e: Error) => e);
      await vi.advanceTimersByTimeAsync(25_000);
      expect(((await caught) as Error).message).toMatch(/did not start/);
      expect(w.terminated).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores messages for other jobs and survives a worker that cannot be created", async () => {
    const w = new FakeWorker();
    const m = new ExportManager({ createWorker: () => w as unknown as Worker });
    const a = m.run("raster", {}, vi.fn());
    await tick();
    w.emit({ type: "done", id: "someone-else", blob: new Blob(), summary });
    w.emit({ type: "done", id: (w.sent[0] as { id: string }).id, blob: new Blob(), summary });
    await a.promise;
    const broken = new ExportManager({ createWorker: () => { throw new Error("no workers"); } });
    await expect(broken.run("raster", {}, () => {}).promise).rejects.toThrow("no workers");
  });
});
