import { prisma } from "@/lib/prisma";
import { fetchAndParseFeed } from "@/lib/rss";
import { insertNewArticles, mapWithConcurrency } from "@/lib/ingest";
import { runAiPipeline } from "@/lib/enrich";

const MAX_ERROR_COUNT = 5;
const CONCURRENCY = 6;

export interface RefreshResult {
  updated: number;
  newArticles: number;
  errors: string[];
}

/** Fetches every followed feed (or one), stores new articles and runs the AI pipeline. */
export async function refreshFeeds(feedId?: string): Promise<RefreshResult | null> {
  const feeds = feedId
    ? await prisma.feed.findMany({ where: { id: feedId, type: { not: "manual" } } })
    : await prisma.feed.findMany({ where: { type: { not: "manual" } } });
  if (feedId && feeds.length === 0) return null;

  const errors: string[] = [];
  const results = await mapWithConcurrency(feeds, CONCURRENCY, async (feed) => {
    try {
      const parsed = await fetchAndParseFeed(feed.url);
      const created = await insertNewArticles(feed.id, parsed.articles);
      await prisma.feed.update({
        where: { id: feed.id },
        data: { lastFetched: new Date(), errorCount: 0 },
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

  await runAiPipeline();
  return {
    updated: feeds.length - errors.length,
    newArticles: results.reduce((sum, n) => sum + n, 0),
    errors,
  };
}
