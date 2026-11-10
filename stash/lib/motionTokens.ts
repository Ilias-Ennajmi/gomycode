/*
 * Motion durations for JavaScript animations (Framer Motion, rAF), read from the CSS
 * tokens in styles/tokens.css so there is one source of truth. The tokens are 0 when
 * reduce motion is on (system or in-app), so animations driven by them stop too.
 */

export type DurationToken = "--dur-fast" | "--dur-screen" | "--dur-sheet";

const FALLBACK_MS: Record<DurationToken, number> = { "--dur-fast": 150, "--dur-screen": 250, "--dur-sheet": 350 };

export function parseDuration(raw: string): number | null {
  const v = raw.trim();
  if (!v) return null;
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return null;
  return v.endsWith("ms") ? n : v.endsWith("s") ? n * 1000 : n;
}

export function tokenMs(name: DurationToken): number {
  if (typeof window === "undefined") return FALLBACK_MS[name];
  return parseDuration(getComputedStyle(document.documentElement).getPropertyValue(name)) ?? FALLBACK_MS[name];
}

/** Seconds, for Framer Motion's `duration`. */
export const tokenSeconds = (name: DurationToken) => tokenMs(name) / 1000;
