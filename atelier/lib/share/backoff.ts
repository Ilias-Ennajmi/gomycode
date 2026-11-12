import { createHash } from "node:crypto";
import { createRateLimiter } from "@/lib/server/rate-limit";

/**
 * Password-attempt backoff per IP and link (docs/SPEC.md section 5: "rate-limited, exponential backoff per IP+link").
 *
 * `lockSeconds` is the table: the first 3 wrong passwords cost nothing, then the delay doubles from 2 s, capped at 15 min.
 * `createAttemptTracker` applies it in memory and adds a coarse per-key request cap built on lib/server/rate-limit.ts.
 * Like that module it is best effort per serverless instance; the `share_auth_attempts` table (0003) is the durable
 * counterpart for the guard to use when it wants a shared count.
 */

const FREE_FAILS = 3;
const MAX_LOCK_SEC = 900;

/** Seconds a visitor must wait after `fails` consecutive wrong passwords: 0 up to 3, then 2^(fails - 3), at most 900. */
export function lockSeconds(fails: number): number {
  if (typeof fails !== "number" || Number.isNaN(fails)) return 0;
  const n = Math.floor(fails);
  if (n <= FREE_FAILS) return 0;
  if (n - FREE_FAILS >= 10) return MAX_LOCK_SEC; // 2^10 = 1024 > 900 (also keeps Infinity out of Math.pow)
  return Math.min(MAX_LOCK_SEC, 2 ** (n - FREE_FAILS));
}

/** One opaque key for (link, IP). The IP never appears in the key, so it cannot end up in a log line or a table dump. */
export function attemptKey(linkId: string, ip: string): string {
  return createHash("sha256").update(`${linkId}\n${ip}`, "utf8").digest("hex").slice(0, 32);
}

export type AttemptCheck = { allowed: boolean; retryAfterSec: number };

export interface AttemptTracker {
  /** Call before verifying a password. Not allowed => answer 429 with `Retry-After: retryAfterSec`, do not verify. */
  check(key: string): AttemptCheck;
  /** Call after a wrong password. Returns the new lock (0 while the free attempts last). */
  fail(key: string): { retryAfterSec: number };
  /** Call after a correct password: forgets the failures. */
  success(key: string): void;
  size(): number;
  reset(): void;
}

export function createAttemptTracker(o: {
  now?: () => number;
  /** Checks allowed per key and minute, failures or not (default 30). */
  burstLimit?: number;
  maxKeys?: number;
  /** Failures are forgotten after this much quiet (default 1 h). */
  forgetAfterMs?: number;
} = {}): AttemptTracker {
  const now = o.now ?? (() => Date.now());
  const maxKeys = o.maxKeys ?? 5000;
  const forgetAfterMs = o.forgetAfterMs ?? 60 * 60 * 1000;
  const burst = createRateLimiter({ limit: o.burstLimit ?? 30, windowMs: 60_000, maxKeys, now });
  const records = new Map<string, { fails: number; lockedUntil: number; lastFailAt: number }>();

  function live(key: string, t: number) {
    const rec = records.get(key);
    if (rec && t - rec.lastFailAt > forgetAfterMs) {
      records.delete(key);
      return undefined;
    }
    return rec;
  }

  return {
    check(key) {
      const t = now();
      const b = burst.hit(key);
      if (!b.ok) return { allowed: false, retryAfterSec: b.retryAfterSec };
      const rec = live(key, t);
      if (rec && rec.lockedUntil > t) return { allowed: false, retryAfterSec: Math.ceil((rec.lockedUntil - t) / 1000) };
      return { allowed: true, retryAfterSec: 0 };
    },
    fail(key) {
      const t = now();
      const fails = (live(key, t)?.fails ?? 0) + 1;
      const lock = lockSeconds(fails);
      records.delete(key); // re-insert so the oldest entry is the least recently failed
      records.set(key, { fails, lockedUntil: lock > 0 ? t + lock * 1000 : 0, lastFailAt: t });
      while (records.size > maxKeys) {
        const oldest = records.keys().next().value;
        if (oldest === undefined) break;
        records.delete(oldest);
      }
      return { retryAfterSec: lock };
    },
    success(key) {
      records.delete(key);
    },
    size: () => records.size,
    reset() {
      records.clear();
      burst.reset();
    },
  };
}
