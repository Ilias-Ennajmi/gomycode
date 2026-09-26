import { prisma } from "@/lib/prisma";
import { generateText, isAiEnabled } from "@/lib/ai";
import { mapWithConcurrency } from "@/lib/ingest";
import { sourceKey } from "@/lib/source-key";
import { CATALOG, type Language, type SourceKind } from "@/lib/discover/catalog";
import { hiddenCatalogIds } from "@/lib/discover/health";
import { searchFeedly, searchYouTubeChannels, type DiscoverResult } from "@/lib/discover/providers";
import { catalogResult, followedKeys, markFollowing } from "@/lib/discover/search";

const CACHE_MS = 24 * 60 * 60 * 1000;
const LANGUAGE_NAMES: Record<Language, string> = { en: "English", fr: "French" };

interface Idea {
  name: string;
  kind: SourceKind;
  why?: string;
}

function simplify(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]/g, "");
}

function sameName(a: string, b: string) {
  const x = simplify(a);
  const y = simplify(b);
  return x.length > 2 && y.length > 2 && (x.includes(y) || y.includes(x));
}

/**
 * Turns an AI idea (just a name) into a real, followable source by looking it
 * up in the catalog, then Feedly or YouTube. Ideas that match nothing are
 * dropped, so invented sources never reach the screen.
 */
async function resolveIdea(idea: Idea, hidden: Set<string>): Promise<DiscoverResult | null> {
  const fromCatalog = CATALOG.find(
    (entry) => !hidden.has(entry.id) && entry.kind === idea.kind && sameName(entry.name, idea.name)
  );
  if (fromCatalog) return { ...catalogResult(fromCatalog), provider: "ai", reason: idea.why };

  try {
    const candidates =
      idea.kind === "youtube"
        ? await searchYouTubeChannels(idea.name)
        : await searchFeedly(idea.name);
    const match = candidates
      .filter((c) => sameName(c.name, idea.name))
      .sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0))[0];
    if (!match) return null;
    // Feedly doesn't know a custom-domain Substack is a newsletter; the AI does.
    const kind = idea.kind === "newsletter" && match.kind === "rss" ? "newsletter" : match.kind;
    return { ...match, kind, provider: "ai", reason: idea.why };
  } catch {
    return null;
  }
}

async function askForIdeas(
  instruction: string,
  langs: Language[],
  count: number,
  reasonLanguage = "English"
) {
  const languages = langs.map((l) => LANGUAGE_NAMES[l]).join(" or ");
  const text = await generateText(instruction, {
    system:
      `You recommend real, currently active sources a reader can follow: websites or blogs with an RSS feed, ` +
      `YouTube channels, and email newsletters (Substack, Beehiiv, Ghost…). Only suggest sources in ${languages}. ` +
      `Prefer well-known, well-regarded sources, and mix the three kinds when it fits. Never invent a source. ` +
      `Reply with JSON: {"sources":[{"name":"exact public name","kind":"rss"|"youtube"|"newsletter",` +
      `"why":"one short reason, written in ${reasonLanguage}"}]} with ${count} items.`,
    json: true,
    maxTokens: 1200,
  });
  const parsed = JSON.parse(text) as { sources?: Partial<Idea>[] };
  return (parsed.sources ?? []).filter(
    (idea): idea is Idea =>
      typeof idea.name === "string" &&
      (idea.kind === "rss" || idea.kind === "youtube" || idea.kind === "newsletter")
  );
}

async function resolveIdeas(ideas: Idea[]) {
  const hidden = await hiddenCatalogIds();
  const resolved = await mapWithConcurrency(ideas, 6, (idea) => resolveIdea(idea, hidden));
  const seen = new Set<string>();
  return resolved.filter((r): r is DiscoverResult => {
    if (!r || seen.has(sourceKey(r.url))) return false;
    seen.add(sourceKey(r.url));
    return true;
  });
}

/** "Describe what you like" → validated sources. */
export async function suggestFromDescription(description: string, langs: Language[]) {
  const ideas = await askForIdeas(
    `Suggest sources for someone who says: "${description.slice(0, 500)}"`,
    langs,
    12,
    "the same language as the reader's words"
  );
  const followed = await followedKeys();
  return markFollowing(await resolveIdeas(ideas), followed);
}

/** Caches results in Setting for a day; `replaces` clears older keys with that prefix. */
async function cached(key: string, compute: () => Promise<DiscoverResult[]>, replaces?: string) {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (row) {
    try {
      const value = JSON.parse(row.value) as { at: number; results: DiscoverResult[] };
      if (Date.now() - value.at < CACHE_MS) return value.results;
    } catch {
      // Recompute below.
    }
  }
  const results = await compute();
  const value = JSON.stringify({ at: Date.now(), results });
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  if (replaces) {
    await prisma.setting.deleteMany({ where: { key: { startsWith: replaces }, NOT: { key } } });
  }
  return results;
}

/** Other catalog picks from the same categories and languages as `urls`. */
function catalogNeighbours(urls: string[], langs: Language[], hidden: Set<string>) {
  const keys = new Set(urls.map(sourceKey));
  const origins = CATALOG.filter((entry) => keys.has(sourceKey(entry.url)));
  const categories = new Set(origins.map((entry) => entry.category));
  return CATALOG.filter(
    (entry) =>
      categories.has(entry.category) &&
      langs.includes(entry.lang) &&
      !hidden.has(entry.id) &&
      !keys.has(sourceKey(entry.url))
  ).map(catalogResult);
}

function notFollowed(results: DiscoverResult[], followed: Set<string>) {
  return markFollowing(results, followed).filter((r) => !r.following);
}

/** "Because you follow X": catalog neighbours first, then AI picks. */
export async function suggestForFeed(feedId: string, langs: Language[]) {
  const feed = await prisma.feed.findUnique({ where: { id: feedId } });
  if (!feed) return [];
  const followed = await followedKeys();
  const hidden = await hiddenCatalogIds();
  const urls = [feed.url, feed.sourceUrl].filter((u): u is string => Boolean(u));
  // Picks in the same language as the followed feed come first.
  const neighbours = notFollowed(catalogNeighbours(urls, langs, hidden), followed)
    .sort((a, b) => Number(b.lang === feed.language) - Number(a.lang === feed.language))
    .slice(0, 4);

  let ai: DiscoverResult[] = [];
  if (isAiEnabled()) {
    ai = await cached(`suggest:feed:${feed.id}:${langs.join(",")}`, async () =>
      resolveIdeas(
        await askForIdeas(
          `The reader just followed "${feed.title}"${feed.description ? ` (${feed.description.slice(0, 200)})` : ""}. ` +
            `Suggest similar sources they would also enjoy.`,
          langs,
          8
        )
      )
    ).catch(() => []);
  }

  const seen = new Set(neighbours.map((r) => sourceKey(r.url)));
  const extra = notFollowed(ai, followed).filter((r) => !seen.has(sourceKey(r.url)));
  return [...neighbours, ...extra].slice(0, 8);
}

/** Suggestions for the Discover home screen, based on everything followed. */
export async function suggestForYou(langs: Language[]) {
  const feeds = await prisma.feed.findMany({
    where: { type: { not: "manual" } },
    select: { id: true, title: true, url: true, sourceUrl: true },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  if (feeds.length === 0) return [];
  const followed = await followedKeys();
  const hidden = await hiddenCatalogIds();

  if (!isAiEnabled()) {
    const urls = feeds.flatMap((f) => [f.url, f.sourceUrl].filter((u): u is string => Boolean(u)));
    return notFollowed(catalogNeighbours(urls, langs, hidden), followed).slice(0, 10);
  }

  // Following something new changes the set, which refreshes the cache.
  const signature = feeds
    .map((f) => f.id)
    .sort()
    .join(",");
  let hash = 0;
  for (let i = 0; i < signature.length; i++) hash = (hash * 31 + signature.charCodeAt(i)) | 0;

  const prefix = `suggest:home:${langs.join(",")}:`;
  const results = await cached(
    `${prefix}${hash}`,
    async () =>
      resolveIdeas(
        await askForIdeas(
          `The reader follows: ${feeds.map((f) => f.title).join("; ")}. ` +
            `Suggest new sources that match these interests and that they don't follow yet.`,
          langs,
          12
        )
      ),
    prefix
  );
  return notFollowed(results, followed).slice(0, 10);
}
