/*
 * The signed-URL cache, without the browser: which cached links are still good, and
 * what a pruned cache looks like. lib/media.ts keeps it in localStorage.
 *
 * Thumbnails and voice notes are signed for 7 days and reused until 12 h before they
 * end, so an image keeps one URL and the service worker's image cache can serve it
 * offline. Videos (bucket stash-video) are signed for 6 h by the phone's own session
 * and reused until 20 minutes before they end, so a video never expires mid-play.
 */

export type SignedEntry = { url: string; exp: number };
export type SignedCache = Record<string, SignedEntry>;

export type BucketPolicy = { ttlS: number; marginMs: number };

const DAY_S = 24 * 3600;
const DEFAULT_POLICY: BucketPolicy = { ttlS: 7 * DAY_S, marginMs: 12 * 3600 * 1000 };
const POLICIES: Record<string, BucketPolicy> = {
  "stash-video": { ttlS: 6 * 3600, marginMs: 20 * 60 * 1000 },
  "stash-exports": { ttlS: 600, marginMs: 60 * 1000 },
};

export function bucketPolicy(bucket: string): BucketPolicy {
  return POLICIES[bucket] ?? DEFAULT_POLICY;
}

export const cacheKey = (bucket: string, path: string) => `${bucket}/${path}`;

/** Splits the wanted paths into those with a link that is still good and those to sign. */
export function pickFresh(
  cache: SignedCache,
  bucket: string,
  paths: Array<string | null | undefined>,
  now: number,
): { fresh: Record<string, string>; missing: string[] } {
  const { marginMs } = bucketPolicy(bucket);
  const fresh: Record<string, string> = {};
  const missing: string[] = [];
  for (const p of new Set(paths.filter((x): x is string => Boolean(x)))) {
    const hit = cache[cacheKey(bucket, p)];
    if (hit && hit.exp - marginMs > now) fresh[p] = hit.url;
    else missing.push(p);
  }
  return { fresh, missing };
}

/** Adds newly signed links; returns a new cache. */
export function remember(cache: SignedCache, bucket: string, signed: Record<string, string>, now: number): SignedCache {
  const { ttlS } = bucketPolicy(bucket);
  const next = { ...cache };
  for (const [path, url] of Object.entries(signed)) next[cacheKey(bucket, path)] = { url, exp: now + ttlS * 1000 };
  return next;
}

/** Drops expired links, and the oldest beyond `max` so localStorage stays small. */
export function prune(cache: SignedCache, now: number, max = 1500): SignedCache {
  const live = Object.entries(cache).filter(([, e]) => e && typeof e.url === "string" && e.exp > now);
  live.sort((a, b) => b[1].exp - a[1].exp);
  return Object.fromEntries(live.slice(0, max));
}

/** Forgets one link (a video that answered 400/403: its link ended early). */
export function forget(cache: SignedCache, bucket: string, path: string): SignedCache {
  const next = { ...cache };
  delete next[cacheKey(bucket, path)];
  return next;
}
