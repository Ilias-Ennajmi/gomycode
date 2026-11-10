/*
 * Streak and weekly goal from activity days (a day counts when something was
 * watched or a recall card answered). Days are local YYYY-MM-DD strings.
 */

export const WEEK_GOAL = 5;

function shift(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Consecutive active days ending today (or yesterday, so the streak survives until tonight). */
export function streak(activeDays: Iterable<string>, today: string): number {
  const days = new Set(activeDays);
  let cursor = days.has(today) ? today : shift(today, -1);
  let n = 0;
  while (days.has(cursor)) {
    n++;
    cursor = shift(cursor, -1);
  }
  return n;
}

/** Active days in the Monday-to-Sunday week that holds `today`. */
export function daysThisWeek(activeDays: Iterable<string>, today: string): number {
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const monday = shift(today, -weekday);
  let n = 0;
  for (const d of new Set(activeDays)) if (d >= monday && d <= today) n++;
  return n;
}
