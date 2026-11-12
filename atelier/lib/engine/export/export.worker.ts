/// <reference lib="webworker" />
// The export worker: runs one job at a time per id off the main thread, reports progress, honours cancel.
import { abortError, type JobKind, type WorkerIn, type WorkerOut } from "./protocol";
import type { JobCtx } from "./jobs";

type Handler = (payload: unknown, ctx: JobCtx) => Promise<{ blob: Blob; summary: import("./protocol").ExportSummary }>;

/** Jobs are imported when first used, so a PNG export never loads the PDF or ZIP code. */
const HANDLERS: Partial<Record<JobKind, Handler>> = {
  raster: async (p, c) => (await import("./jobs")).runRasterJob(p as never, c),
  svg: async (p, c) => (await import("./jobs")).runSvgJob(p as never, c),
  pdf: async (p, c) => (await import("./jobs")).runPdfJob(p as never, c),
};

const controllers = new Map<string, AbortController>();
const post = (m: WorkerOut): void => (self as unknown as Worker).postMessage(m);

async function run(id: string, kind: JobKind, payload: unknown): Promise<void> {
  const ac = new AbortController();
  controllers.set(id, ac);
  try {
    const handler = HANDLERS[kind];
    if (!handler) throw new Error(`Unknown export job "${kind}"`);
    const out = await handler(payload, {
      signal: ac.signal,
      onProgress: (ratio, label) => post({ type: "progress", id, ratio: Math.min(1, Math.max(0, ratio)), label }),
    });
    if (ac.signal.aborted) throw abortError();
    post({ type: "done", id, blob: out.blob, summary: out.summary });
  } catch (e) {
    post({ type: "error", id, name: e instanceof Error ? e.name : undefined, message: e instanceof Error ? e.message : "The export failed." });
  } finally {
    controllers.delete(id);
  }
}

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const m = e.data;
  if (m.type === "start") void run(m.id, m.kind, m.payload);
  else if (m.type === "cancel") controllers.get(m.id)?.abort();
};

// Tell the manager the handler is in place: a worker module can finish loading after the first messages were sent.
post({ type: "ready" });

export {};
