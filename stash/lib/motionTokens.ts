/*
 * Motion for JavaScript animations (Framer Motion, rAF), read from the CSS tokens in
 * styles/tokens.css so there is one source of truth. The duration tokens are 0 when
 * reduce motion is on (system or in-app), so animations driven by them stop too, and
 * every spring below collapses to an instant change through `spring(name, motionOK)`.
 */

export type DurationToken = "--dur-press" | "--dur-fast" | "--dur-screen" | "--dur-sheet";

const FALLBACK_MS: Record<DurationToken, number> = { "--dur-press": 120, "--dur-fast": 160, "--dur-screen": 260, "--dur-sheet": 380 };

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

/** Strong ease-out (--motion-ease-out) for Framer Motion. */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/*
 * Springs. The brand is bold and playful, so the gesture springs carry a little bounce;
 * sheets settle without wobble. Physics values, not durations: they keep the velocity of
 * a flick when a gesture is interrupted.
 */
export const SPRINGS = {
  /** Bottom sheets: quick, no overshoot to speak of. */
  sheet: { type: "spring", stiffness: 420, damping: 38, mass: 0.9 },
  /** Cards flying off after keep / archive / file: lively. */
  fling: { type: "spring", stiffness: 300, damping: 24, mass: 0.8 },
  /** Snap back to centre after a swipe that didn't commit: a satisfying wobble. */
  snap: { type: "spring", stiffness: 520, damping: 20, mass: 0.7 },
  /** Small things that change state (a check, a tab indicator): a pop. */
  pop: { type: "spring", stiffness: 600, damping: 26, mass: 0.6 },
} as const;

export type SpringName = keyof typeof SPRINGS;
type Instant = { duration: 0 };

/** The spring, or an instant change when motion is reduced. */
export function spring(name: SpringName, motionOK: boolean): (typeof SPRINGS)[SpringName] | Instant {
  return motionOK ? SPRINGS[name] : { duration: 0 };
}
