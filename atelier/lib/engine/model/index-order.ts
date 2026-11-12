import { generateKeyBetween } from "fractional-indexing";

/**
 * Fractional index strictly between `a` and `b` (either may be null for "no bound").
 * Compare keys with plain `<` / `>` (code-unit order), never `localeCompare`.
 */
export function keyBetween(a: string | null, b: string | null): string {
  return generateKeyBetween(a, b);
}

/** Total order used everywhere for z-order: by index, ties broken by id so replicas agree. */
export function compareByIndex(a: { index: string; id: string }, b: { index: string; id: string }): number {
  if (a.index !== b.index) return a.index < b.index ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
