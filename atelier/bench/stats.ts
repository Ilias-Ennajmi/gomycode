// Pure statistics over a Chromium trace (no DOM, no Node APIs): run by bench/run.ts and unit-tested.

export type TraceEvent = { name: string; ph: string; ts: number /* µs */; dur?: number; args?: Record<string, unknown>; pid: number; tid: number };

/** Gaps longer than this are idle time between gestures, not frames. */
const IDLE_GAP_MS = 250;

/** Nearest-rank percentile, `p` in 0..100. An empty list gives NaN. */
export function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return Number.NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  const rank = Math.ceil((Math.min(Math.max(p, 0), 100) / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

/**
 * Gaps (ms) between consecutive "DrawFrame" events of the same layer tree. Gaps above 250 ms are idle time and are
 * dropped. Events may arrive in any order.
 */
export function frameIntervalsMs(events: TraceEvent[]): number[] {
  const byTree = new Map<string, number[]>();
  for (const e of events) {
    if (e.name !== "DrawFrame") continue;
    const tree = String(e.args?.layerTreeId ?? e.args?.layer_tree_host_id ?? `${e.pid}`);
    const list = byTree.get(tree);
    if (list) list.push(e.ts);
    else byTree.set(tree, [e.ts]);
  }
  const out: number[] = [];
  for (const times of byTree.values()) {
    times.sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) {
      const gap = (times[i] - times[i - 1]) / 1000;
      if (gap <= IDLE_GAP_MS) out.push(gap);
    }
  }
  return out;
}

/** Number of "RunTask" events that ran for at least `thresholdMs`. */
export function longTasks(events: TraceEvent[], thresholdMs = 50): number {
  let n = 0;
  for (const e of events) if (e.name === "RunTask" && (e.dur ?? 0) >= thresholdMs * 1000) n++;
  return n;
}

export type FrameSummary = { fps: number; p50: number; p95: number; p99: number; frames: number };

/** fps is 1000 / mean interval; the percentiles are of the intervals. No frames: all NaN and 0 frames. */
export function summarise(intervals: number[]): FrameSummary {
  if (intervals.length === 0) return { fps: Number.NaN, p50: Number.NaN, p95: Number.NaN, p99: Number.NaN, frames: 0 };
  const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length;
  return { fps: mean > 0 ? 1000 / mean : Number.NaN, p50: percentile(intervals, 50), p95: percentile(intervals, 95), p99: percentile(intervals, 99), frames: intervals.length };
}
