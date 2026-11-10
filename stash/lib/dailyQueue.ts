/*
 * "Your 5 for today": picks what to play from the whole library, fitted to the
 * length the owner chose (2, 6, 10 or 30 minutes). Pure and deterministic, so
 * the app and the cron route build the same queue and it stays stable all day.
 *
 * The mix, in turn: a project Space due soon, a kept save whose recall card is
 * due, the newest unwatched, an older unwatched worth another look. Archived
 * and still-processing saves never appear; saves skipped before sink.
 */

export type QueueCandidate = {
  id: string;
  status: string;
  savedAt: string;
  duration: number | null;
  spaceId: string | null;
  spaceKind?: string | null;
  spaceDueDate?: string | null;
  watchedAt: string | null;
  archivedAt: string | null;
  kept: boolean;
  appliedAt?: string | null;
  skipCount?: number;
  hasDueCard?: boolean;
};

export const QUEUE_LENGTHS = [2, 6, 10, 30] as const;
export type QueueLength = (typeof QUEUE_LENGTHS)[number];
export const DEFAULT_MINUTES = 6;

/** Seconds assumed for a save whose length is unknown (a typical reel). */
export const UNKNOWN_SECONDS = 45;
const PROJECT_WINDOW_DAYS = 14;
const OLD_AFTER_DAYS = 14;

/** Most items per length, so 2 minutes stays a quick hit and 30 minutes isn't 40 reels. */
export function maxItems(minutes: number): number {
  if (minutes <= 2) return 3;
  if (minutes <= 6) return 5;
  if (minutes <= 10) return 8;
  return 20;
}

export function normalizeMinutes(m: number | null | undefined): number {
  const n = Number(m);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MINUTES;
  return Math.min(120, Math.round(n));
}

/** Stable 32-bit hash of a string (FNV-1a). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Small seeded PRNG (mulberry32): same seed, same sequence. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PLAYABLE = new Set(["ready", "failed", "dead_link"]);
const DAY_MS = 86_400_000;

const dayStart = (day: string) => Date.parse(`${day}T00:00:00Z`);

type Bucket = "project" | "recall" | "newest" | "old";
const PATTERN: Bucket[] = ["project", "recall", "newest", "old", "newest", "recall", "project", "old"];

export type BuildOptions = {
  /** Local date the queue is for, YYYY-MM-DD. Seeds the order. */
  day: string;
  minutes?: number | null;
  /** Extra seed (e.g. the user id) so two people don't get the same shuffle. */
  seed?: string;
};

export function buildDailyQueue(candidates: QueueCandidate[], opts: BuildOptions): string[] {
  const minutes = normalizeMinutes(opts.minutes);
  const budget = minutes * 60;
  const cap = maxItems(minutes);
  const today = dayStart(opts.day);

  const pool = candidates.filter((c) => PLAYABLE.has(c.status) && !c.archivedAt);
  // A seeded tie-breaker per save keeps equal items in a stable but daily-varying order,
  // whatever order the candidates arrive in.
  const jitter = new Map(pool.map((c) => [c.id, seededRandom(hashString(`${opts.day}|${opts.seed ?? ""}|${c.id}`))()]));
  const skips = (c: QueueCandidate) => c.skipCount ?? 0;
  const bySkipsThen = (cmp: (a: QueueCandidate, b: QueueCandidate) => number) => (a: QueueCandidate, b: QueueCandidate) =>
    skips(a) - skips(b) || cmp(a, b) || (jitter.get(a.id) ?? 0) - (jitter.get(b.id) ?? 0);

  const savedMs = (c: QueueCandidate) => Date.parse(c.savedAt) || 0;
  const dueMs = (c: QueueCandidate) => (c.spaceDueDate ? dayStart(c.spaceDueDate) : Infinity);

  const buckets: Record<Bucket, QueueCandidate[]> = {
    project: pool
      .filter(
        (c) =>
          !c.watchedAt &&
          c.spaceKind === "project" &&
          dueMs(c) >= today &&
          dueMs(c) - today <= PROJECT_WINDOW_DAYS * DAY_MS,
      )
      .sort(bySkipsThen((a, b) => dueMs(a) - dueMs(b))),
    recall: pool.filter((c) => c.kept && c.hasDueCard).sort(bySkipsThen((a, b) => savedMs(b) - savedMs(a))),
    newest: pool.filter((c) => !c.watchedAt).sort(bySkipsThen((a, b) => savedMs(b) - savedMs(a))),
    // Worth another look: unwatched and at least two weeks old, in a seeded order (not always the very oldest).
    old: pool
      .filter((c) => !c.watchedAt && today - savedMs(c) >= OLD_AFTER_DAYS * DAY_MS)
      .sort(bySkipsThen(() => 0)),
  };

  const picked: string[] = [];
  const taken = new Set<string>();
  let total = 0;

  const nextFrom = (b: Bucket) => buckets[b].find((c) => !taken.has(c.id));
  const fits = (c: QueueCandidate) => {
    const secs = c.duration && c.duration > 0 ? c.duration : UNKNOWN_SECONDS;
    // Always at least one item; afterwards allow a little overrun (a reel rarely ends on the minute).
    return picked.length === 0 || total + secs <= budget * 1.15;
  };

  let misses = 0;
  for (let i = 0; picked.length < cap && misses < PATTERN.length * 2; i++) {
    const want = PATTERN[i % PATTERN.length];
    const order: Bucket[] = [want, "newest", "recall", "old", "project"];
    let chosen: QueueCandidate | undefined;
    for (const b of order) {
      const c = nextFrom(b);
      if (c) {
        chosen = c;
        break;
      }
    }
    if (!chosen) break;
    taken.add(chosen.id);
    if (!fits(chosen)) {
      misses++;
      continue;
    }
    picked.push(chosen.id);
    total += chosen.duration && chosen.duration > 0 ? chosen.duration : UNKNOWN_SECONDS;
  }
  return picked;
}

/** Estimated minutes for a list of saves (unknown lengths count as a typical reel). */
export function estimateMinutes(durations: (number | null | undefined)[]): number {
  const secs = durations.reduce<number>((s, d) => s + (d && d > 0 ? d : UNKNOWN_SECONDS), 0);
  return Math.max(1, Math.round(secs / 60));
}

/** Local calendar date (YYYY-MM-DD) in a time zone, defaulting to the device's. */
export function localDay(now = new Date(), timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
