import type { Feed, FeedType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fetchAndParseFeed, type ParsedFeed } from "@/lib/rss";
import { resolveSource, type ResolvedSource } from "@/lib/feed-source";
import { discoverFaviconUrl } from "@/lib/favicon";
import { insertNewArticles } from "@/lib/ingest";
import { getFaviconFallbackColor } from "@/lib/utils";
import { sourceKey } from "@/lib/source-key";
import { topicQuery, topicTitle } from "@/lib/discover/topics";
import { detectPlatform } from "@/lib/newsletters";

export interface FollowInput {
  url: string;
  categoryId?: string | null;
  /** Put the feed in the category with this name, creating it if needed. */
  categoryName?: string;
  language?: string;
  /** Overrides the feed's own title. */
  title?: string;
  /** Shows the source in the News tab, in this section. */
  newsDesk?: string | null;
  region?: string | null;
  /** A hint from Discover; only ever upgrades an RSS feed to a newsletter. */
  kind?: "rss" | "youtube" | "newsletter";
}

/** "no-feed": the site has no feed we can read; it can still be followed through news search. */
export type FollowErrorCode = "no-feed" | "unreachable";

export class FollowError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: FollowErrorCode
  ) {
    super(message);
  }
}

// Follows run in parallel ("Follow all"), so concurrent lookups of the same
// new category share one creation instead of each making a duplicate.
const categoryLookups = new Map<string, Promise<string>>();

async function findOrCreateCategory(name: string) {
  const existing = await prisma.category.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (existing) return existing.id;
  const maxOrder = await prisma.category.aggregate({ _max: { order: true } });
  const created = await prisma.category.create({
    data: { name, color: getFaviconFallbackColor(name), order: (maxOrder._max.order ?? -1) + 1 },
  });
  return created.id;
}

async function categoryIdFor(input: FollowInput) {
  if (input.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
    if (!category) throw new FollowError("Category not found", 404);
    return category.id;
  }
  const name = input.categoryName?.trim();
  if (!name) return null;

  const key = name.toLowerCase();
  let lookup = categoryLookups.get(key);
  if (!lookup) {
    lookup = findOrCreateCategory(name).finally(() => categoryLookups.delete(key));
    categoryLookups.set(key, lookup);
  }
  return lookup;
}

function feedType(source: ResolvedSource, parsed: ParsedFeed, input: FollowInput): FeedType {
  // A feed whose items are all YouTube videos is a channel, whatever its URL.
  const allVideos = parsed.articles.length > 0 && parsed.articles.every((a) => a.isVideo);
  if (source.type === "rss" && allVideos) return "youtube";
  if (source.type !== "rss") return source.type;
  const newsletter =
    input.kind === "newsletter" || Boolean(detectPlatform(source.feedUrl, parsed.meta.generator));
  return newsletter ? "newsletter" : "rss";
}

/**
 * Resolves, fetches and saves a source. Throws FollowError with an HTTP status
 * the caller can pass on. With `allowExisting`, following something already
 * followed returns the existing feed instead of failing.
 */
export async function followSource(
  input: FollowInput,
  { allowExisting = false } = {}
): Promise<{ feed: Feed; existed: boolean }> {
  let source: ResolvedSource;
  try {
    source = await resolveSource(input.url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/No RSS feed/i.test(message)) {
      throw new FollowError("This site doesn't publish a feed", 422, "no-feed");
    }
    const status = message.match(/status (\d+)/)?.[1];
    throw new FollowError(
      status === "403" || status === "401"
        ? "This site blocks feed readers"
        : "Couldn't reach this address. Check the link and try again",
      422,
      status === "403" || status === "401" ? "no-feed" : "unreachable"
    );
  }

  const existing = await prisma.feed.findUnique({ where: { url: source.feedUrl } });
  if (existing) {
    if (!allowExisting) throw new FollowError("This feed is already added", 409);
    // Adding an already-followed source to News moves it there.
    if (input.newsDesk && existing.newsDesk !== input.newsDesk) {
      const feed = await prisma.feed.update({
        where: { id: existing.id },
        data: { newsDesk: input.newsDesk, region: input.region ?? existing.region },
      });
      return { feed, existed: true };
    }
    return { feed: existing, existed: true };
  }

  let parsed: ParsedFeed;
  try {
    parsed = await fetchAndParseFeed(source.feedUrl);
  } catch (error) {
    const blocked = /status 40[13]/.test(error instanceof Error ? error.message : "");
    throw new FollowError(
      blocked ? "This site blocks feed readers" : "The feed didn't load. Try again in a moment",
      422,
      blocked ? "no-feed" : "unreachable"
    );
  }

  const topic = topicQuery(source.feedUrl);
  // A site followed through news search gets that site's icon; a plain topic gets none.
  const topicSite = topic?.match(/^site:(\S+)$/i)?.[1];
  const iconFrom = topic
    ? topicSite
      ? `https://${topicSite}`
      : null
    : parsed.meta.siteUrl || source.feedUrl;
  const [faviconUrl, categoryId] = await Promise.all([
    source.faviconUrl ??
      (iconFrom ? discoverFaviconUrl(iconFrom).catch(() => undefined) : undefined),
    categoryIdFor(input),
  ]);

  const followedUrl = input.url.trim();
  const type = feedType(source, parsed, input);
  const feed = await prisma.feed.create({
    data: {
      type,
      platform:
        type === "newsletter" ? detectPlatform(source.feedUrl, parsed.meta.generator) : null,
      title: input.title?.trim() || (topic ? topicTitle(topic) : parsed.meta.title),
      url: source.feedUrl,
      sourceUrl: sourceKey(followedUrl) === sourceKey(source.feedUrl) ? null : followedUrl,
      siteUrl: topic ? (topicSite ? `https://${topicSite}` : undefined) : parsed.meta.siteUrl,
      description: topic ? `News search: ${topic}` : parsed.meta.description,
      faviconUrl,
      coverUrl: parsed.meta.coverUrl,
      language: input.language || parsed.meta.language || null,
      categoryId,
      newsDesk: input.newsDesk || null,
      region: input.region || null,
      lastFetched: new Date(),
    },
  });

  await insertNewArticles(feed.id, parsed.articles);
  return { feed, existed: false };
}
