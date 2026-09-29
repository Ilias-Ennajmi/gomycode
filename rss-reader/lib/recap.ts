import { prisma } from "@/lib/prisma";
import { readingMinutes } from "@/lib/articles";
import { HIGHLIGHT_ARTICLE_INCLUDE } from "@/lib/highlights";
import { generateText, isAiEnabled } from "@/lib/ai";
import { readSetting, weekKey, writeSetting } from "@/lib/push";
import type { Briefing } from "@/lib/digest";

// The weekly recap: the last seven days of reading, the week's lead stories (from the stored
// daily briefings; story groups themselves only cover two days), and a short AI summary.

const TIMEZONE = process.env.APP_TIMEZONE || "Africa/Casablanca";
const DAY_MS = 24 * 3600 * 1000;
const SUMMARY_MAX_AGE_MS = 6 * 3600 * 1000;

export interface RecapStory {
  articleId: string;
  headline: string;
  why: string;
  imageUrl: string | null;
  date: string;
  sources: string[];
}

export interface WeeklyRecap {
  week: string;
  from: string;
  to: string;
  stats: {
    read: number;
    minutes: number;
    saved: number;
    finished: number;
    highlights: number;
    notes: number;
    /** Days (of the seven) with at least one article read. */
    activeDays: number;
  };
  days: { date: string; read: number }[];
  topSources: { id: string; title: string; faviconUrl: string | null; read: number }[];
  stories: RecapStory[];
  highlights: Awaited<ReturnType<typeof recentHighlights>>;
  summary: string | null;
}

function localDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(date);
}

function recentHighlights(since: Date) {
  return prisma.highlight.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 4,
    include: HIGHLIGHT_ARTICLE_INCLUDE,
  });
}

export async function buildRecap(): Promise<WeeklyRecap> {
  const now = new Date();
  const since = new Date(now.getTime() - 7 * DAY_MS);
  const dayKeys = Array.from({ length: 7 }, (_, i) =>
    localDate(new Date(now.getTime() - (6 - i) * DAY_MS))
  );

  const [read, saved, finished, highlights, notes, digests, topHighlights] = await Promise.all([
    prisma.article.findMany({
      where: { isRead: true, readAt: { gte: since } },
      select: {
        readAt: true,
        readProgress: true,
        fullContent: true,
        content: true,
        summary: true,
        isVideo: true,
        feed: { select: { id: true, title: true, faviconUrl: true, type: true } },
      },
    }),
    prisma.article.count({ where: { savedAt: { gte: since } } }),
    prisma.article.count({ where: { archivedAt: { gte: since } } }),
    prisma.highlight.count({ where: { createdAt: { gte: since } } }),
    prisma.highlight.count({ where: { createdAt: { gte: since }, note: { not: null } } }),
    prisma.dailyDigest.findMany({ where: { date: { in: dayKeys } }, orderBy: { date: "desc" } }),
    recentHighlights(since),
  ]);

  // Time read: an article opened and read to the end counts in full, one skimmed in part.
  let minutes = 0;
  const perDay = new Map<string, number>();
  const perSource = new Map<
    string,
    { id: string; title: string; faviconUrl: string | null; read: number }
  >();
  for (const article of read) {
    const share = article.readProgress > 0 ? Math.max(0.3, article.readProgress / 100) : 0.5;
    minutes += article.isVideo ? 0 : readingMinutes(article) * share;
    const day = localDate(article.readAt!);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
    if (article.feed.type !== "manual") {
      const entry = perSource.get(article.feed.id) ?? { ...article.feed, read: 0 };
      entry.read++;
      perSource.set(article.feed.id, entry);
    }
  }

  // Each day's lead story, from that day's briefing.
  const stories: RecapStory[] = [];
  for (const digest of digests) {
    try {
      const briefing = JSON.parse(digest.content) as Briefing;
      const lead = briefing.top?.[0];
      if (!lead) continue;
      stories.push({
        articleId: lead.articleId,
        headline: lead.headline,
        why: lead.why,
        imageUrl: lead.imageUrl,
        date: digest.date,
        sources: (lead.sources ?? []).map((s) => s.title),
      });
    } catch {
      // A briefing from an older format: skip it.
    }
  }

  const recap: WeeklyRecap = {
    week: weekKey(now),
    from: dayKeys[0],
    to: dayKeys[6],
    stats: {
      read: read.length,
      minutes: Math.round(minutes),
      saved,
      finished,
      highlights,
      notes,
      activeDays: dayKeys.filter((d) => (perDay.get(d) ?? 0) > 0).length,
    },
    days: dayKeys.map((date) => ({ date, read: perDay.get(date) ?? 0 })),
    topSources: Array.from(perSource.values())
      .sort((a, b) => b.read - a.read)
      .slice(0, 5),
    stories,
    highlights: topHighlights,
    summary: null,
  };
  recap.summary = await recapSummary(recap).catch((error) => {
    console.error("Recap summary failed", error);
    return null;
  });
  return recap;
}

/** Two or three sentences on the week, cached for a few hours to spare the free AI quota. */
async function recapSummary(recap: WeeklyRecap) {
  if (!isAiEnabled() || recap.stories.length === 0) return null;
  const key = `recap-summary-${recap.week}`;
  const cached = await readSetting<{ at: number; text: string | null }>(key, { at: 0, text: null });
  if (cached.text && Date.now() - cached.at < SUMMARY_MAX_AGE_MS) return cached.text;

  const text = await generateText(
    [
      "The week's lead stories, one per day:",
      ...recap.stories.map((s) => `- ${s.date}: ${s.headline} (${s.why})`),
      "",
      `The reader read ${recap.stats.read} articles (about ${recap.stats.minutes} minutes), ` +
        `saved ${recap.stats.saved} and made ${recap.stats.highlights} highlights.`,
      recap.topSources.length
        ? `Most read sources: ${recap.topSources.map((s) => s.title).join(", ")}.`
        : "",
    ].join("\n"),
    {
      system:
        "Write a warm, plain two- or three-sentence recap of the week for this reader: the big " +
        "themes in the news, then one line about their reading. No lists, no emoji, no greeting. " +
        "Answer in English.",
      maxTokens: 220,
    }
  );
  await writeSetting(key, { at: Date.now(), text });
  return text;
}
