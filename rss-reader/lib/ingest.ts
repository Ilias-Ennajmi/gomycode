import { prisma } from "@/lib/prisma";
import type { ParsedArticle } from "@/lib/rss";
import { cleanHtml } from "@/lib/clean-html";

/** Inserts articles that don't exist yet for this feed and returns the new rows. */
export async function insertNewArticles(feedId: string, articles: ParsedArticle[]) {
  if (articles.length === 0) return [];

  return prisma.article.createManyAndReturn({
    data: articles.map((article) => ({
      feedId,
      title: article.title,
      link: article.link,
      summary: article.summary,
      content: cleanHtml(article.content),
      imageUrl: article.imageUrl,
      // Email newsletters send "Name <address>": keep the name.
      author: article.author?.replace(/\s*<[^>]*@[^>]*>\s*$/, "").trim() || article.author,
      publishedAt: article.publishedAt,
      isVideo: article.isVideo ?? false,
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
