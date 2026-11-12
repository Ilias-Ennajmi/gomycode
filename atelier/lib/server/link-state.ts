import type { LinkRow } from "@/lib/share/link";
import type { Round } from "@/lib/share/round-types";
import { loadLinkState } from "./viewer-board";
import type { ShareStore } from "./share-store";

/*
 * `loadLinkState` decodes a Yjs snapshot, which is the one expensive step of showing a board. A published round is frozen, so
 * its bytes are kept for a few minutes; a live board for a few seconds (a new frame shows up almost at once, and a burst of
 * reactions does not decode the board for every tap). Keyed per store instance, never by anything a visitor supplies.
 *
 * Reading from the cache does not skip the guard: callers have already checked the link (revoked, expired, scope) on this
 * very request. The cache only holds board state, which has no per-visitor content.
 */

const ROUND_TTL_MS = 5 * 60_000;
const LIVE_TTL_MS = 3_000;
const MAX_ENTRIES = 40;

type Entry = { at: number; value: { state: Uint8Array; round: Round | null } };
const caches = new WeakMap<ShareStore, Map<string, Entry>>();
let clock: () => number = () => Date.now();

export function clearLinkStateCache(): void {
  // Entries live in a WeakMap by store; a fresh clock-independent reset is done by swapping the maps' contents lazily.
  generation++;
}
let generation = 0;
const seen = new WeakMap<ShareStore, number>();

/** Tests only. */
export function setLinkStateClock(now: (() => number) | null): void {
  clock = now ?? (() => Date.now());
}

export async function cachedLinkState(store: ShareStore, link: LinkRow): Promise<{ state: Uint8Array; round: Round | null }> {
  if (seen.get(store) !== generation) {
    caches.delete(store);
    seen.set(store, generation);
  }
  let map = caches.get(store);
  if (!map) caches.set(store, (map = new Map()));
  const key = link.mode === "round" ? `r:${link.boardId}:${link.roundId}` : `l:${link.boardId}`;
  const ttl = link.mode === "round" ? ROUND_TTL_MS : LIVE_TTL_MS;
  const now = clock();
  const hit = map.get(key);
  if (hit && now - hit.at < ttl) return hit.value;

  const value = await loadLinkState(store, link); // throws a 404 Response when the round is missing
  map.delete(key);
  map.set(key, { at: now, value });
  while (map.size > MAX_ENTRIES) map.delete(map.keys().next().value as string);
  return value;
}
