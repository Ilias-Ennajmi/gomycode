import type { Feed, FeedType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fetchAndParseFeed, type ParsedFeed } from "@/lib/rss";
import { resolveSource, type ResolvedSource } from "@/lib/feed-source";
import { discoverFaviconUrl } from "@/lib/favicon";
import { insertNewArticles } from "@/lib/ingest";
import { getFaviconFallbackColor } from "@/lib/utils";
import { sourceKey } from "@/lib/source-key";

export interface FollowInput {
  url: string;
  categoryId?: string | null;
  /** Put the feed in the category with this name, creating it if needed. */
  categoryName?: string;
  language?: string;
  /** A hint from Discover; only ever upgrades an RSS feed to a newsletter. */
  kind?: "rss" | "youtube" | "newsletter";
}

export class FollowError extends Error {
  constructor(
    message: string,
    public status: number
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
  const newsletter = input.kind === "newsletter" || /substack/i.test(parsed.meta.generator ?? "");
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
  } catch {
    throw new FollowError("Could not find a feed or YouTube channel at this URL", 422);
  }

  const existing = await prisma.feed.findUnique({ where: { url: source.feedUrl } });
  if (existing) {
    if (!allowExisting) throw new FollowError("This feed is already added", 409);
    return { feed: existing, existed: true };
  }

  let parsed: ParsedFeed;
  try {
    parsed = await fetchAndParseFeed(source.feedUrl);
  } catch {
    throw new FollowError("Could not fetch feed — check URL", 422);
  }

  const [faviconUrl, categoryId] = await Promise.all([
    source.faviconUrl ??
      discoverFaviconUrl(parsed.meta.siteUrl || source.feedUrl).catch(() => undefined),
    categoryIdFor(input),
  ]);

  const followedUrl = input.url.trim();
  const feed = await prisma.feed.create({
    data: {
      type: feedType(source, parsed, input),
      title: parsed.meta.title,
      url: source.feedUrl,
      sourceUrl: sourceKey(followedUrl) === sourceKey(source.feedUrl) ? null : followedUrl,
      siteUrl: parsed.meta.siteUrl,
      description: parsed.meta.description,
      faviconUrl,
      coverUrl: parsed.meta.coverUrl,
      language: input.language || parsed.meta.language || null,
      categoryId,
      lastFetched: new Date(),
    },
  });

  await insertNewArticles(feed.id, parsed.articles);
  return { feed, existed: false };
}
