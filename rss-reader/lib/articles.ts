import type { FeedType, Prisma } from "@prisma/client";

export const ARTICLE_FEED_INCLUDE = {
  feed: {
    select: {
      id: true,
      title: true,
      faviconUrl: true,
      categoryId: true,
      type: true,
      platform: true,
    },
  },
  _count: { select: { highlights: true } },
} as const;

const WORDS_PER_MINUTE = 220;

/** Minutes to read, from the full page when it was fetched, else the feed's text. */
export function readingMinutes(article: {
  fullContent?: string | null;
  content?: string | null;
  summary?: string | null;
}) {
  const html = article.fullContent || article.content || article.summary || "";
  // Counting spaces is close enough and much cheaper than splitting long pages.
  const text = html.replace(/<[^>]*>/g, " ");
  const words = (text.match(/\S+/g) ?? []).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/**
 * Drops heavy server-only fields before sending to the client: the embedding
 * (~256 floats), the search index and the cached full page, which the reader loads on its own.
 */
export function serializeArticle<
  T extends {
    embedding?: number[];
    fullContent?: string | null;
    content?: string | null;
    summary?: string | null;
    search?: unknown;
    transcript?: unknown;
    keyMoments?: unknown;
    chapters?: unknown;
    _count?: { highlights: number };
  },
>(article: T) {
  // Video extras are loaded by the reader (/api/articles/[id]/video), not with every list.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { embedding, fullContent, search, transcript, keyMoments, chapters, _count, ...rest } =
    article;
  return {
    ...rest,
    readingMinutes: readingMinutes(article),
    highlightCount: _count?.highlights ?? 0,
  };
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

/**
 * Newsletters sub-tabs. Platform is null for newsletters of unknown origin, which count as
 * web ones (NOT platform = 'email' would drop them: NULL isn't unequal to anything).
 */
export function newsletterFilter(kind: string | null): Prisma.ArticleWhereInput | null {
  if (kind === "email") return { feed: { type: "newsletter", platform: "email" } };
  if (kind === "web") {
    return {
      feed: { type: "newsletter", OR: [{ platform: null }, { platform: { not: "email" } }] },
    };
  }
  return null;
}

/** Snoozed articles stay out of every list until they wake up. */
export function notSnoozed(now = new Date()): Prisma.ArticleWhereInput {
  return { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] };
}

const SINCE_MS: Record<string, number> = {
  day: 24 * 3600 * 1000,
  week: 7 * 24 * 3600 * 1000,
  month: 31 * 24 * 3600 * 1000,
};

/** "day", "week" or "month" back from now; null for any time. */
export function sinceDate(since: string | null) {
  const ms = since ? SINCE_MS[since] : undefined;
  return ms ? new Date(Date.now() - ms) : null;
}

/** "none" selects feeds without a category. */
export function categoryFilter(categoryId: string): Prisma.ArticleWhereInput {
  return { feed: { categoryId: categoryId === "none" ? null : categoryId } };
}

/** "all" selects every News source; a section id just that section. */
export function newsFilter(desk: string): Prisma.ArticleWhereInput {
  return { feed: { newsDesk: desk === "all" ? { not: null } : desk } };
}
