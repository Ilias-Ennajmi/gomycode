// Runs export jobs in the export worker, one at a time, with progress and cancel.
import { ExportCancelled, type ExportSummary, type JobKind, type WorkerIn, type WorkerOut } from "./protocol";

export { ExportCancelled } from "./protocol";
export type { ExportSummary, JobKind, WorkerIn, WorkerOut } from "./protocol";

/** How long a cancelled worker gets to stop by itself before it is terminated. */
export const CANCEL_GRACE_MS = 100;
/** How long a new worker gets to load and say it is ready. */
export const READY_TIMEOUT_MS = 20_000;

type Job = {
  id: string;
  kind: JobKind;
  payload: unknown;
  onProgress(ratio: number, label: string): void;
  resolve(v: { blob: Blob; summary: ExportSummary }): void;
  reject(e: Error): void;
  cancelTimer?: ReturnType<typeof setTimeout>;
};

function defaultWorker(): Worker {
  return new Worker(new URL("./export.worker.ts", import.meta.url), { type: "module" });
}

export class ExportManager {
  private worker: Worker | null = null;
  private ready = false;
  private readyTimer: ReturnType<typeof setTimeout> | undefined;
  private current: Job | null = null;
  private readonly queue: Job[] = [];
  private counter = 0;
  private readonly createWorker: () => Worker;

  constructor(deps: { createWorker?: () => Worker } = {}) {
    this.createWorker = deps.createWorker ?? defaultWorker;
  }

  run(kind: JobKind, payload: unknown, onProgress: (ratio: number, label: string) => void): { promise: Promise<{ blob: Blob; summary: ExportSummary }>; cancel(): void } {
    let job!: Job;
    const promise = new Promise<{ blob: Blob; summary: ExportSummary }>((resolve, reject) => {
      job = { id: `job${++this.counter}`, kind, payload, onProgress, resolve, reject };
    });
    this.queue.push(job);
    queueMicrotask(() => this.pump());
    return { promise, cancel: () => this.cancel(job) };
  }

  private cancel(job: Job): void {
    const queued = this.queue.indexOf(job);
    if (queued >= 0) {
      this.queue.splice(queued, 1);
      job.reject(new ExportCancelled());
      return;
    }
    if (this.current !== job || job.cancelTimer) return;
    if (this.ready) this.post({ type: "cancel", id: job.id });
    job.cancelTimer = setTimeout(() => {
      this.dropWorker();
      this.settle(job, () => job.reject(new ExportCancelled()));
    }, CANCEL_GRACE_MS);
  }

  private post(m: WorkerIn): void {
    this.worker?.postMessage(m);
  }

  private dropWorker(): void {
    const w = this.worker;
    this.worker = null;
    this.ready = false;
    if (this.readyTimer) clearTimeout(this.readyTimer);
    if (w) {
      w.onmessage = null;
      w.onerror = null;
      w.terminate();
    }
  }

  private settle(job: Job, fn: () => void): void {
    if (job.cancelTimer) clearTimeout(job.cancelTimer);
    if (this.current === job) this.current = null;
    fn();
    queueMicrotask(() => this.pump());
  }

  private pump(): void {
    if (this.current || this.queue.length === 0) return;
    const job = this.queue.shift()!;
    this.current = job;
    try {
      if (!this.worker) {
        const w = this.createWorker();
        w.onmessage = (e: MessageEvent<WorkerOut>) => this.onMessage(e.data);
        w.onerror = (e: ErrorEvent) => this.onCrash(e.message || "The export worker stopped unexpectedly.");
        this.worker = w;
        this.ready = false;
        this.readyTimer = setTimeout(() => this.onCrash("The export worker did not start. Reload the page and try again."), READY_TIMEOUT_MS);
      }
      if (this.ready) this.post({ type: "start", id: job.id, kind: job.kind, payload: job.payload });
    } catch (e) {
      this.dropWorker();
      this.settle(job, () => job.reject(new Error(e instanceof Error ? e.message : "Exports are not available in this browser.")));
    }
  }

  private onMessage(m: WorkerOut): void {
    const job = this.current;
    if (m.type === "ready") {
      this.ready = true;
      if (this.readyTimer) clearTimeout(this.readyTimer);
      if (job && !job.cancelTimer) this.post({ type: "start", id: job.id, kind: job.kind, payload: job.payload });
      return;
    }
    if (!job || m.id !== job.id) return;
    if (m.type === "progress") {
      if (!job.cancelTimer) job.onProgress(m.ratio, m.label);
    } else if (m.type === "done") {
      this.settle(job, () => job.resolve({ blob: m.blob, summary: m.summary }));
    } else if (m.type === "error") {
      const cancelled = job.cancelTimer !== undefined && m.name === "AbortError";
      this.settle(job, () => job.reject(cancelled ? new ExportCancelled() : Object.assign(new Error(m.message), { name: m.name ?? "Error" })));
    }
  }

  private onCrash(message: string): void {
    const job = this.current;
    this.dropWorker();
    if (job) this.settle(job, () => job.reject(new Error(message)));
  }
}

let shared: ExportManager | null = null;
/** The one manager the app shares (so jobs queue behind each other). */
export function getExportManager(): ExportManager {
  return (shared ??= new ExportManager());
}
