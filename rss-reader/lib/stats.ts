import { prisma } from "@/lib/prisma";
import { readingMinutes } from "@/lib/articles";

// Reading stats: what was read, when, from where, over the last 30 days (and a few totals).

const TIMEZONE = process.env.APP_TIMEZONE || "Africa/Casablanca";
const DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReadingStats {
  days: { day: string; read: number; minutes: number }[];
  totals: {
    read: number;
    minutes: number;
    highlights: number;
    saved: number;
    finished: number;
    allTimeRead: number;
    allTimeHighlights: number;
  };
  /** Days in a row (ending today or yesterday) with something read. */
  streak: number;
  bestDay: { day: string; read: number } | null;
  /** Hour of day (0–23, app time zone) → articles read. */
  hours: number[];
  sources: {
    id: string;
    title: string;
    faviconUrl: string | null;
    read: number;
    minutes: number;
  }[];
  types: { type: string; read: number }[];
}

function dayKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(date);
}

function hourOf(date: Date) {
  const text = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "numeric",
    hourCycle: "h23",
  }).format(date);
  return Number(text) % 24;
}

/** Minutes an item took: reading time for text, what was played for videos and episodes. */
function minutesOf(article: {
  content: string | null;
  summary: string | null;
  isVideo: boolean;
  audioUrl: string | null;
  durationSeconds: number | null;
  watchedSeconds: number | null;
}) {
  if (article.isVideo || article.audioUrl) {
    const seconds = article.watchedSeconds || article.durationSeconds || 0;
    return Math.round(seconds / 60);
  }
  return readingMinutes(article);
}

export async function readingStats(): Promise<ReadingStats> {
  const since = new Date(Date.now() - DAYS * DAY_MS);
  const [read, highlights, saved, finished, allTimeRead, allTimeHighlights] = await Promise.all([
    prisma.article.findMany({
      where: { readAt: { gte: since } },
      select: {
        readAt: true,
        content: true,
        summary: true,
        isVideo: true,
        audioUrl: true,
        durationSeconds: true,
        watchedSeconds: true,
        feed: { select: { id: true, title: true, faviconUrl: true, type: true } },
      },
    }),
    prisma.highlight.count({ where: { createdAt: { gte: since } } }),
    prisma.article.count({ where: { savedAt: { gte: since } } }),
    prisma.article.count({ where: { archivedAt: { gte: since } } }),
    prisma.article.count({ where: { isRead: true } }),
    prisma.highlight.count(),
  ]);

  const days = new Map<string, { read: number; minutes: number }>();
  for (let i = DAYS - 1; i >= 0; i--) {
    days.set(dayKey(new Date(Date.now() - i * DAY_MS)), { read: 0, minutes: 0 });
  }
  const hours = new Array<number>(24).fill(0);
  const sources = new Map<string, ReadingStats["sources"][number]>();
  const types = new Map<string, number>();
  let minutes = 0;
  for (const article of read) {
    if (!article.readAt) continue;
    const m = minutesOf(article);
    minutes += m;
    const day = days.get(dayKey(article.readAt));
    if (day) {
      day.read += 1;
      day.minutes += m;
    }
    hours[hourOf(article.readAt)] += 1;
    const source = sources.get(article.feed.id) ?? {
      id: article.feed.id,
      title: article.feed.title,
      faviconUrl: article.feed.faviconUrl,
      read: 0,
      minutes: 0,
    };
    source.read += 1;
    source.minutes += m;
    sources.set(article.feed.id, source);
    types.set(article.feed.type, (types.get(article.feed.type) ?? 0) + 1);
  }

  const dayList = Array.from(days, ([day, value]) => ({ day, ...value }));
  let streak = 0;
  for (let i = dayList.length - 1; i >= 0; i--) {
    if (dayList[i].read > 0) streak += 1;
    // Today can still be empty without breaking the run.
    else if (i !== dayList.length - 1) break;
  }
  const best = dayList.reduce<ReadingStats["bestDay"]>(
    (top, d) => (d.read > (top?.read ?? 0) ? { day: d.day, read: d.read } : top),
    null
  );

  return {
    days: dayList,
    totals: {
      read: read.length,
      minutes,
      highlights,
      saved,
      finished,
      allTimeRead,
      allTimeHighlights,
    },
    streak,
    bestDay: best,
    hours,
    sources: Array.from(sources.values())
      .sort((a, b) => b.read - a.read)
      .slice(0, 6),
    types: Array.from(types, ([type, count]) => ({ type, read: count })).sort(
      (a, b) => b.read - a.read
    ),
  };
}
