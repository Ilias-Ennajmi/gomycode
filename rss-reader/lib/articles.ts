import type { FeedType, Prisma } from "@prisma/client";

export const ARTICLE_FEED_INCLUDE = {
  feed: { select: { id: true, title: true, faviconUrl: true, categoryId: true, type: true } },
} as const;

/**
 * Drops heavy server-only fields before sending to the client: the embedding
 * (~256 floats) and the cached full page, which the reader loads on its own.
 */
export function serializeArticle<T extends { embedding?: number[]; fullContent?: string | null }>(
  article: T
) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { embedding, fullContent, ...rest } = article;
  return rest;
}

export const SOURCE_TYPES = ["rss", "youtube", "newsletter"] as const;

export function parseSource(value: unknown): FeedType | undefined {
  return SOURCE_TYPES.includes(value as (typeof SOURCE_TYPES)[number])
    ? (value as FeedType)
    : undefined;
}

/**
 * Source tabs go by the article as well as the feed, so a video from a feed
 * that wasn't recognised as YouTube still lands in YouTube, not RSS.
 */
export function sourceFilter(source: FeedType): Prisma.ArticleWhereInput {
  if (source === "youtube") return { OR: [{ isVideo: true }, { feed: { type: "youtube" } }] };
  // News sources live in the News tab, not RSS.
  if (source === "rss") return { isVideo: false, feed: { type: "rss", newsDesk: null } };
  return { feed: { type: source } };
}

/** "none" selects feeds without a category. */
export function categoryFilter(categoryId: string): Prisma.ArticleWhereInput {
  return { feed: { categoryId: categoryId === "none" ? null : categoryId } };
}

/** "all" selects every News source; a section id just that section. */
export function newsFilter(desk: string): Prisma.ArticleWhereInput {
  return { feed: { newsDesk: desk === "all" ? { not: null } : desk } };
}
