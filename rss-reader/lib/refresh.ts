import { prisma } from "@/lib/prisma";
import { fetchAndParseFeed } from "@/lib/rss";
import { insertNewArticles, mapWithConcurrency } from "@/lib/ingest";
import { runAiPipeline } from "@/lib/enrich";
import { applyArrivalRules } from "@/lib/rules";

const MAX_ERROR_COUNT = 5;
const CONCURRENCY = 6;

// Adaptive cadence: a source that posts daily is read every hour; one quiet for a week is
// read every six hours; one quiet for a month, once a day. Opening a single source always
// reads it.
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const QUIET_WEEK_INTERVAL_MS = 6 * HOUR_MS;
const QUIET_MONTH_INTERVAL_MS = 24 * HOUR_MS;

export interface RefreshResult {
  updated: number;
  newArticles: number;
  /** Sources left alone this time because they rarely post. */
  skipped: number;
  errors: string[];
}

function isDue(
  feed: { lastFetched: Date | null; createdAt: Date; errorCount: number },
  lastPublished: Date | undefined,
  now: number
) {
  if (!feed.lastFetched) return true;
  const quietFor = now - (lastPublished ?? feed.createdAt).getTime();
  const sinceFetch = now - feed.lastFetched.getTime();
  // Failing feeds are retried less often too, so one dead site doesn't cost every hour.
  if (feed.errorCount >= MAX_ERROR_COUNT) return sinceFetch > QUIET_MONTH_INTERVAL_MS;
  if (quietFor > 30 * DAY_MS) return sinceFetch > QUIET_MONTH_INTERVAL_MS;
  if (quietFor > 7 * DAY_MS) return sinceFetch > QUIET_WEEK_INTERVAL_MS;
  return true;
}

/** Fetches every followed feed that's due (or one), stores new articles and runs the AI pipeline. */
export async function refreshFeeds(feedId?: string): Promise<RefreshResult | null> {
  const all = feedId
    ? await prisma.feed.findMany({ where: { id: feedId, type: { not: "manual" } } })
    : await prisma.feed.findMany({ where: { type: { not: "manual" } } });
  if (feedId && all.length === 0) return null;

  let feeds = all;
  if (!feedId) {
    const latest = await prisma.article.groupBy({ by: ["feedId"], _max: { publishedAt: true } });
    const lastPublished = new Map(
      latest.map((row) => [row.feedId, row._max.publishedAt ?? undefined])
    );
    const now = Date.now();
    feeds = all.filter((feed) => isDue(feed, lastPublished.get(feed.id), now));
  }

  const errors: string[] = [];
  const arrived: string[] = [];
  const results = await mapWithConcurrency(feeds, CONCURRENCY, async (feed) => {
    try {
      const parsed = await fetchAndParseFeed(feed.url);
      const created = await insertNewArticles(feed.id, parsed.articles);
      arrived.push(...created.map((article) => article.id));
      await prisma.feed.update({
        where: { id: feed.id },
        data: {
          lastFetched: new Date(),
          errorCount: 0,
          // New videos: read the channel's pages again for their lengths.
          ...(created.length && feed.type === "youtube" ? { videosScannedAt: null } : {}),
        },
      });
      return created.length;
    } catch (error) {
      console.error(`Failed to refresh feed ${feed.title}`, error);
      errors.push(`${feed.title}: could not fetch feed`);
      await prisma.feed.update({
        where: { id: feed.id },
        data: {
          errorCount: Math.min(feed.errorCount + 1, MAX_ERROR_COUNT + 1),
          lastFetched: new Date(),
        },
      });
      return 0;
    }
  });

  // Alerts and auto-save, before the AI work so a slow Gemini can't delay them.
  await applyArrivalRules(arrived).catch((error) => console.error("Rules failed", error));
  await runAiPipeline();
  return {
    updated: feeds.length - errors.length,
    newArticles: results.reduce((sum, n) => sum + n, 0),
    skipped: all.length - feeds.length,
    errors,
  };
}
