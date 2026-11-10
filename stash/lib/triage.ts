import type { SaveItem } from "@/lib/data";

/*
 * Backlog triage: old saves nobody watched, one card at a time, Let go or Keep.
 * Pure rules here (unit-tested); the screen lives in app/triage.
 */

export const TRIAGE_MIN_AGE_DAYS = 30;
export const TRIAGE_DEFAULT_LIMIT = 20;
/** A save seen in triage and left alone isn't shown again for this long. */
export const TRIAGE_COOLDOWN_DAYS = 30;

const DAY = 86_400_000;

export function startOfDay(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Old, unwatched, not archived, not kept or applied, done processing; oldest first. */
export function triageCandidates(
  saves: SaveItem[],
  now: Date,
  seenAt: Record<string, string | null | undefined> = {},
): SaveItem[] {
  const cutoff = now.getTime() - TRIAGE_MIN_AGE_DAYS * DAY;
  const cooldown = now.getTime() - TRIAGE_COOLDOWN_DAYS * DAY;
  return saves
    .filter((s) => {
      if (s.archivedAt || s.watchedAt || s.kept || s.appliedAt) return false;
      if (s.status === "queued" || s.status === "processing") return false;
      if (new Date(s.savedAt).getTime() > cutoff) return false;
      const seen = seenAt[s.id];
      return !(seen && new Date(seen).getTime() > cooldown);
    })
    .sort((a, b) => a.savedAt.localeCompare(b.savedAt));
}

/** How many cards are left today, given the daily limit and what was already triaged today. */
export function remainingToday(limit: number, seenAt: Record<string, string | null | undefined>, now: Date): number {
  const start = startOfDay(now).getTime();
  const done = Object.values(seenAt).filter((t) => t && new Date(t).getTime() >= start).length;
  return Math.max(0, limit - done);
}

/** "8 months ago" style age for a card. */
export function ageLabel(savedAt: string, now: Date): string {
  const days = Math.floor((now.getTime() - new Date(savedAt).getTime()) / DAY);
  if (days < 1) return "today";
  if (days < 45) return `${days} days ago`;
  const months = Math.round(days / 30.4);
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(months / 12);
  return years === 1 ? "a year ago" : `${years} years ago`;
}
