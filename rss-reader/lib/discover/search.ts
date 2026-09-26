import { prisma } from "@/lib/prisma";
import { fetchAndParseFeed } from "@/lib/rss";
import { resolveSource } from "@/lib/feed-source";
import { sourceKey } from "@/lib/source-key";
import { CATALOG, categoryName, type CatalogEntry, type Language } from "@/lib/discover/catalog";
import { hiddenCatalogIds } from "@/lib/discover/health";
import { searchFeedly, searchYouTubeChannels, type DiscoverResult } from "@/lib/discover/providers";

export function catalogResult(entry: CatalogEntry): DiscoverResult {
  return {
    url: entry.url,
    name: entry.name,
    kind: entry.kind,
    lang: entry.lang,
    description: entry.description,
    provider: "catalog",
    category: categoryName(entry.category),
  };
}

function fold(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Catalog entries whose name, description or category contain every word of the query. */
export function searchCatalog(query: string, langs: Language[], hidden: Set<string>) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return CATALOG.filter((entry) => {
    if (hidden.has(entry.id) || !langs.includes(entry.lang)) return false;
    const haystack = fold(`${entry.name} ${entry.description} ${categoryName(entry.category)}`);
    return words.every((word) => haystack.includes(word));
  });
}

/** Every URL the user already follows, as normalized keys. */
export async function followedKeys() {
  const feeds = await prisma.feed.findMany({
    where: { type: { not: "manual" } },
    select: { url: true, sourceUrl: true },
  });
  return new Set(
    feeds.flatMap((feed) => [feed.url, feed.sourceUrl].filter(Boolean).map((u) => sourceKey(u!)))
  );
}

export function markFollowing<T extends DiscoverResult>(results: T[], followed: Set<string>) {
  return results.map((r) => ({ ...r, following: followed.has(sourceKey(r.url)) }));
}

function looksLikeUrl(query: string) {
  return /^https?:\/\//i.test(query) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(query);
}

/** Checks that a URL really is a followable feed and returns it as a result. */
export async function previewUrl(input: string): Promise<DiscoverResult | null> {
  try {
    const source = await resolveSource(input);
    const parsed = await fetchAndParseFeed(source.feedUrl);
    return {
      url: source.feedUrl,
      name: parsed.meta.title,
      kind: source.type === "manual" ? "rss" : source.type,
      lang: parsed.meta.language,
      description: parsed.meta.description,
      imageUrl: source.faviconUrl,
      siteUrl: parsed.meta.siteUrl,
      provider: "link",
    };
  } catch {
    return null;
  }
}

/** Each outside provider is optional: a failure is logged and reported, never thrown. */
async function settle<T>(promise: Promise<T[]>, label: string, unavailable: string[]) {
  try {
    return await promise;
  } catch (error) {
    console.warn(`Discover: ${label} unavailable`, error instanceof Error ? error.message : error);
    unavailable.push(label);
    return [];
  }
}

export interface SearchResponse {
  results: DiscoverResult[];
  /** Providers that failed, so the UI can say "YouTube search is unavailable". */
  unavailable: string[];
}

/**
 * Searches the catalog, Feedly and YouTube in parallel. Catalog matches come
 * first, then the rest ranked by readers; duplicates are dropped.
 */
export async function searchSources(query: string, langs: Language[]): Promise<SearchResponse> {
  const trimmed = query.trim();
  const followed = await followedKeys();

  if (looksLikeUrl(trimmed)) {
    const result = await previewUrl(trimmed);
    return { results: result ? markFollowing([result], followed) : [], unavailable: [] };
  }

  const hidden = await hiddenCatalogIds();
  const unavailable: string[] = [];
  const locale = langs.length === 1 ? langs[0] : undefined;
  const [feedly, youtube] = await Promise.all([
    settle(searchFeedly(trimmed, locale), "Feedly", unavailable),
    settle(searchYouTubeChannels(trimmed), "YouTube", unavailable),
  ]);

  const catalog = searchCatalog(trimmed, langs, hidden).map(catalogResult);
  // Feedly knows each feed's language; keep feeds in a chosen language (or unknown).
  const feeds = feedly
    .filter((r) => !r.lang || langs.includes(r.lang as Language))
    .sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0));

  const seen = new Set<string>();
  const results = [...catalog, ...feeds, ...youtube.slice(0, 8)].filter((r) => {
    const key = sourceKey(r.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { results: markFollowing(results, followed), unavailable };
}
