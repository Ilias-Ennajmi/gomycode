export const BACKOFF_BASE_MS = 1000;
export const BACKOFF_MAX_MS = 60_000;

/** Delay before retry number `attempt` (0 = first retry): 1 s, 2 s, 4 s ... capped at 60 s. */
export function backoffDelay(attempt: number): number {
  const n = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0;
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.min(n, 30));
}
