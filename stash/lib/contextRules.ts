/*
 * Context reminders ("Remind me… when it fits"). A TWA can't watch Wi-Fi, location or
 * other apps in the background, so only rules Stash can actually honour:
 *
 *   weekend_morning  time-based: the next Saturday or Sunday at 09:00 local. Carries a
 *                    fire_at, so the 5-minute cron sends it like a time reminder (push).
 *   evening_open     the next time Stash is opened between 18:00 and 23:00 local.
 *   learn_open       the next time Learn is opened.
 *
 * The last two are checked on the phone; firing marks the reminder fired with
 * fire_at = now, so it shows on Today under "For you" like any reminder that fired.
 * Pure functions, unit-tested (tests/unit/contextRules.test.ts).
 */

export const CONTEXT_RULES = ["weekend_morning", "evening_open", "learn_open"] as const;
export type ContextRule = (typeof CONTEXT_RULES)[number];

export function isContextRule(v: unknown): v is ContextRule {
  return (CONTEXT_RULES as readonly string[]).includes(String(v));
}

export const WEEKEND_HOUR = 9;
export const EVENING_START = 18;
export const EVENING_END = 23;
/** An evening reminder set during an evening fires on a later open, not the one it was set in. */
export const SAME_EVENING_GAP_MS = 60 * 60_000;

/** The next Saturday or Sunday at 09:00 local time, strictly after `now`. */
export function nextWeekendMorning(now: Date): Date {
  for (let i = 0; i <= 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, WEEKEND_HOUR, 0, 0, 0);
    if ((d.getDay() === 6 || d.getDay() === 0) && d > now) return d;
  }
  throw new Error("unreachable");
}

export function inEvening(now: Date): boolean {
  const h = now.getHours();
  return h >= EVENING_START && h < EVENING_END;
}

/** Fire an evening_open reminder on this app open? */
export function eveningDue(createdAt: Date, now: Date): boolean {
  if (!inEvening(now)) return false;
  const tonight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), EVENING_START, 0, 0, 0);
  return createdAt < tonight || now.getTime() - createdAt.getTime() >= SAME_EVENING_GAP_MS;
}

/** Fire a learn_open reminder now that Learn is open? (Any reminder set before this visit.) */
export function learnDue(createdAt: Date, openedAt: Date): boolean {
  return createdAt.getTime() < openedAt.getTime();
}

export const CONTEXT_LABEL: Record<ContextRule, string> = {
  weekend_morning: "Weekend morning",
  evening_open: "Next evening in Stash",
  learn_open: "When I open Learn",
};
