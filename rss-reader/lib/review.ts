import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readSetting, writeSetting } from "@/lib/push";
import { HIGHLIGHT_ARTICLE_INCLUDE } from "@/lib/highlights";

// The daily review, in the spirit of Readwise: a few highlights a day, and each one comes
// back after a gap that grows when you say you still remember it (spaced repetition).
// "Again" brings it back tomorrow; "Good" and "Easy" push it further out; "Never" retires it.

export const DAILY_COUNT = 5;
const TIMEZONE = process.env.APP_TIMEZONE || "Africa/Casablanca";
const DAY_MS = 24 * 3600 * 1000;
/** New highlights wait a day before their first review: they're still fresh. */
const FIRST_REVIEW_AFTER_MS = DAY_MS;
const MAX_INTERVAL_DAYS = 365;

export type ReviewGrade = "again" | "good" | "easy" | "never";
export const REVIEW_GRADES: ReviewGrade[] = ["again", "good", "easy", "never"];

/** Days until the next review for each answer, from the current gap. */
export function nextIntervals(interval: number) {
  return {
    again: 1,
    good: Math.min(MAX_INTERVAL_DAYS, interval ? Math.round(interval * 2.2) : 4),
    easy: Math.min(MAX_INTERVAL_DAYS, interval ? Math.round(interval * 3.5) : 10),
  };
}

function dayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(date);
}

/** Midnight today in the app's time zone, as a Date. */
function startOfToday(now = new Date()) {
  const key = dayKey(now);
  // The offset of the time zone right now, from how "now" reads there.
  const local = new Date(now.toLocaleString("en-US", { timeZone: TIMEZONE }));
  const offset = local.getTime() - now.getTime();
  return new Date(new Date(`${key}T00:00:00Z`).getTime() - offset);
}

/** Due now: its review date has come, or it's never been reviewed and is a day old. */
function dueWhere(now = new Date()): Prisma.HighlightWhereInput {
  return {
    reviewDisabled: false,
    OR: [
      { reviewDueAt: { lte: now } },
      { reviewDueAt: null, createdAt: { lt: new Date(now.getTime() - FIRST_REVIEW_AFTER_MS) } },
    ],
  };
}

interface ReviewLog {
  /** Days (YYYY-MM-DD) with at least one review, newest last, kept for the streak. */
  days: string[];
}

const LOG_KEY = "review-log";

/** Consecutive days with a review, ending today (or yesterday, before today's review). */
export function streakOf(days: string[], today = dayKey()) {
  const set = new Set(days);
  const cursor = new Date(`${today}T12:00:00Z`);
  if (!set.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (set.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

/** Today's review: what's left to see today, and how it's going. */
export async function todaysReview() {
  const now = new Date();
  const [reviewedToday, dueCount, total, log] = await Promise.all([
    prisma.highlight.count({ where: { reviewedAt: { gte: startOfToday(now) } } }),
    prisma.highlight.count({ where: dueWhere(now) }),
    prisma.highlight.count({ where: { reviewDisabled: false } }),
    readSetting<ReviewLog>(LOG_KEY, { days: [] }),
  ]);
  const left = Math.max(0, DAILY_COUNT - reviewedToday);
  // Overdue ones first (longest waiting), then never-reviewed ones, oldest first.
  const highlights = left
    ? await prisma.highlight.findMany({
        where: dueWhere(now),
        orderBy: [{ reviewDueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
        take: left,
        include: HIGHLIGHT_ARTICLE_INCLUDE,
      })
    : [];
  return {
    highlights: highlights.map((h) => ({ ...h, next: nextIntervals(h.reviewInterval) })),
    reviewedToday,
    dailyCount: DAILY_COUNT,
    /** Due beyond today's set: "review more" offers them. */
    moreDue: Math.max(0, dueCount - highlights.length),
    total,
    streak: streakOf(log.days),
  };
}

/** The next few due highlights, past today's set ("Review more"). */
export async function moreToReview(count = DAILY_COUNT) {
  const highlights = await prisma.highlight.findMany({
    where: dueWhere(),
    orderBy: [{ reviewDueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: count,
    include: HIGHLIGHT_ARTICLE_INCLUDE,
  });
  return highlights.map((h) => ({ ...h, next: nextIntervals(h.reviewInterval) }));
}

/** Records an answer and schedules the highlight's next review. */
export async function gradeHighlight(id: string, grade: ReviewGrade) {
  const highlight = await prisma.highlight.findUnique({
    where: { id },
    select: { reviewInterval: true },
  });
  if (!highlight) return null;
  const now = new Date();
  const data: Prisma.HighlightUpdateInput =
    grade === "never"
      ? { reviewDisabled: true, reviewedAt: now }
      : (() => {
          const interval = nextIntervals(highlight.reviewInterval)[grade];
          return {
            reviewInterval: interval,
            reviewDueAt: new Date(now.getTime() + interval * DAY_MS),
            reviewCount: { increment: 1 },
            reviewedAt: now,
          };
        })();
  const updated = await prisma.highlight.update({ where: { id }, data });

  const log = await readSetting<ReviewLog>(LOG_KEY, { days: [] });
  const today = dayKey(now);
  if (log.days.at(-1) !== today) {
    await writeSetting(LOG_KEY, { days: [...log.days, today].slice(-400) });
  }
  return updated;
}
