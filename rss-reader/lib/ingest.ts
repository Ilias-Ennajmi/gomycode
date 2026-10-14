import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ParsedArticle } from "@/lib/rss";
import { cleanHtml } from "@/lib/clean-html";
import { DAY_MS, retentionDays } from "@/lib/retention";
import { chaptersFromNotes, showNotesHtml } from "@/lib/podcast";

// A new podcast can list hundreds of episodes; the newest are the ones worth having.
const FIRST_EPISODES = 20;

// Some feeds put a time zone on local times, which dates articles in the future and pins
// them to the top of every list.
const FUTURE_SLACK_MS = 5 * 60 * 1000;

function notInFuture(date: Date) {
  return date.getTime() > Date.now() + FUTURE_SLACK_MS ? new Date() : date;
}

/**
 * Inserts articles that don't exist yet and returns the new rows. An article already stored
 * by another feed (same link, e.g. a site's main and sports feeds) is skipped, and so is
 * backlog older than the retention window once a feed has articles (see cleanupArticles).
 */
export async function insertNewArticles(feedId: string, articles: ParsedArticle[]) {
  if (articles.length === 0) return [];

  const [existing, feed, hasArticles] = await Promise.all([
    prisma.article.findMany({
      where: { link: { in: articles.map((article) => article.link) } },
      select: { link: true },
    }),
    prisma.feed.findUnique({ where: { id: feedId }, select: { newsDesk: true, type: true } }),
    prisma.article.findFirst({ where: { feedId }, select: { id: true } }),
  ]);
  const known = new Set(existing.map((row) => row.link));
  const cutoff = Date.now() - retentionDays(feed?.newsDesk ?? null) * DAY_MS;
  let fresh = articles.filter(
    (article) =>
      !known.has(article.link) && !(hasArticles && article.publishedAt.getTime() < cutoff)
  );
  if (feed?.type === "podcast" && !hasArticles) {
    fresh = fresh
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, FIRST_EPISODES);
  }
  if (fresh.length === 0) return [];

  return prisma.article.createManyAndReturn({
    data: fresh.map((article) => ({
      feedId,
      title: article.title,
      link: article.link,
      summary: article.summary,
      // Episodes: show notes with times that jump the player, and chapters from them.
      content: article.audioUrl
        ? cleanHtml(showNotesHtml(article.content))
        : cleanHtml(article.content),
      imageUrl: article.imageUrl,
      // Email newsletters send "Name <address>": keep the name.
      author: article.author?.replace(/\s*<[^>]*@[^>]*>\s*$/, "").trim() || article.author,
      publishedAt: notInFuture(article.publishedAt),
      isVideo: article.isVideo ?? false,
      isShort: /youtube\.com\/shorts\//.test(article.link),
      ...(article.audioUrl
        ? {
            audioUrl: article.audioUrl,
            audioType: article.audioType,
            durationSeconds: article.durationSeconds,
            chapters: chaptersFromNotes(article.content) as unknown as Prisma.InputJsonValue,
          }
        : {}),
    })),
    skipDuplicates: true,
    select: { id: true },
  });
}

/** Runs `fn` over `items` with at most `limit` promises in flight. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
