import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { pendingAnalysisIds, scheduleAnalysis, type AnalysisDeps } from "./backfill";
import type { AssetMetaStore } from "./meta-store";

export type AnalysisSchedulerDeps = {
  doc: BoardDoc;
  meta: AssetMetaStore;
  resolver: AnalysisDeps["resolver"];
  /** Quiet time after a change before the board is checked for images with no colours yet. Default 1 s. */
  debounceMs?: number;
  /** Test seam; defaults to scheduleAnalysis. */
  schedule?: typeof scheduleAnalysis;
  onError?: (e: unknown) => void;
};

/**
 * Finds the pictures on the board whose colours have never been worked out (images from before Phase 2, or whose upload
 * could not) and has them analysed one at a time when the browser is idle, from the board opening and again whenever
 * images or asset metadata arrive. Each image is queued once; one that failed is not retried in this session, one that
 * was skipped (offline) is tried again at the next check. `stop()` cancels the running job.
 */
export class AnalysisScheduler {
  private readonly d: AnalysisSchedulerDeps;
  private readonly queued = new Set<string>();
  private readonly failed = new Set<string>();
  private readonly jobs = new Set<{ cancel(): void }>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private offs: Array<() => void> = [];

  constructor(deps: AnalysisSchedulerDeps) {
    this.d = deps;
  }

  start(): void {
    if (this.offs.length) return;
    const later = () => {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.timer = null;
        this.check();
      }, this.d.debounceMs ?? 1000);
    };
    this.offs = [this.d.doc.onChange(later), this.d.meta.subscribe(later)];
    if (typeof window !== "undefined") {
      window.addEventListener("online", later);
      this.offs.push(() => window.removeEventListener("online", later));
    }
    later();
  }

  stop(): void {
    for (const off of this.offs) off();
    this.offs = [];
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const job of this.jobs) job.cancel();
    this.jobs.clear();
  }

  /** Queue whatever needs analysing and is not queued already. */
  check(): void {
    const assetIds: string[] = [];
    for (const o of this.d.doc.all()) if (o.type === "image") assetIds.push(o.assetId);
    const ids = pendingAnalysisIds(this.d.meta, assetIds).filter((id) => !this.queued.has(id) && !this.failed.has(id));
    if (ids.length === 0) return;
    for (const id of ids) this.queued.add(id);
    const schedule = this.d.schedule ?? scheduleAnalysis;
    let errored = false;
    const job = schedule(
      ids,
      { resolver: this.d.resolver, meta: this.d.meta },
      {
        onError: (e) => {
          // Which one failed is not reported; the ones still unanalysed when the job ends are the failures.
          this.d.onError?.(e);
          errored = true;
        },
      },
    );
    this.jobs.add(job);
    void job.finished.then(() => {
      this.jobs.delete(job);
      for (const id of ids) {
        this.queued.delete(id);
        if (errored && this.d.meta.get(id)?.analysisVersion !== 1) this.failed.add(id);
      }
    });
  }
}
