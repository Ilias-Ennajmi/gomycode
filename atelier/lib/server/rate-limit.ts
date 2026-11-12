/**
 * In-memory sliding-window rate limiter, keyed by a string (the owner's user id).
 *
 * Best effort only: the counters live in this process's memory. On serverless hosting (Vercel) each warm instance has its
 * own copy and instances are recycled, so the real ceiling is `limit` per instance per window, not per account. That is
 * acceptable here: the routes are owner-only and the limit exists to stop a runaway client or a stolen session from
 * turning the server into an open scanner, not to meter usage. A shared store would be needed for a hard guarantee.
 */
export type RateLimitResult = { ok: boolean; retryAfterSec: number };

export type RateLimiter = {
  /** Records a hit and says whether it is within the limit. Refused hits are not recorded. */
  hit(key: string): RateLimitResult;
  /** Number of keys currently tracked. */
  size(): number;
  reset(): void;
};

export function createRateLimiter(o: { limit: number; windowMs: number; maxKeys?: number; now?: () => number }): RateLimiter {
  const { limit, windowMs } = o;
  const maxKeys = o.maxKeys ?? 1000;
  const now = o.now ?? (() => Date.now()); // looked up per call so fake clocks in tests apply
  const hits = new Map<string, number[]>();

  function prune(t: number) {
    for (const [key, list] of hits) {
      if (list.length === 0 || list[list.length - 1] <= t - windowMs) hits.delete(key);
    }
  }

  return {
    hit(key) {
      const t = now();
      if (hits.size >= maxKeys && !hits.has(key)) {
        prune(t);
        // Still full of live keys: drop the oldest-inserted ones (a hard cap beats unbounded memory).
        for (const old of hits.keys()) {
          if (hits.size < maxKeys) break;
          hits.delete(old);
        }
      }
      const list = hits.get(key) ?? [];
      while (list.length > 0 && list[0] <= t - windowMs) list.shift();
      if (list.length >= limit) {
        hits.set(key, list);
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((list[0] + windowMs - t) / 1000)) };
      }
      list.push(t);
      hits.set(key, list);
      return { ok: true, retryAfterSec: 0 };
    },
    size: () => hits.size,
    reset: () => hits.clear(),
  };
}
