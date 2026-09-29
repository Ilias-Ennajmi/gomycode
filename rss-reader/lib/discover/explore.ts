import {
  inScope,
  type CatalogCategoryId,
  type DiscoverKind,
  type Language,
} from "@/lib/discover/catalog";
import { searchFeedly, searchYouTubeChannels, type DiscoverResult } from "@/lib/discover/providers";
import { dedupe, followedKeys, markFollowing } from "@/lib/discover/search";

// "More like this" under each Discover category: live results from Feedly and
// YouTube for a list of searches per category. Each page runs the next search,
// so a category keeps going as long as the reader keeps asking.

type Keywords = Record<Language, string[]>;

const KEYWORDS: Record<CatalogCategoryId, Keywords> = {
  tech: {
    en: [
      "technology",
      "artificial intelligence",
      "gadgets",
      "programming",
      "cybersecurity",
      "open source",
      "apple",
      "startups tech",
    ],
    fr: ["technologie", "intelligence artificielle", "high-tech", "développement web", "numérique"],
  },
  design: {
    en: [
      "design",
      "ux design",
      "ui design",
      "typography",
      "branding",
      "product design",
      "web design",
      "illustration",
    ],
    fr: ["design", "graphisme", "ux", "typographie", "identité visuelle"],
  },
  marketing: {
    en: [
      "marketing",
      "seo",
      "content marketing",
      "social media marketing",
      "copywriting",
      "growth",
      "advertising",
      "email marketing",
    ],
    fr: ["marketing", "marketing digital", "référencement", "réseaux sociaux", "publicité"],
  },
  business: {
    en: [
      "startups",
      "entrepreneurship",
      "business strategy",
      "venture capital",
      "leadership",
      "saas",
      "small business",
    ],
    fr: ["entrepreneuriat", "startups", "management", "stratégie d'entreprise", "business"],
  },
  productivity: {
    en: [
      "productivity",
      "note taking",
      "time management",
      "habits",
      "remote work",
      "self improvement",
    ],
    fr: ["productivité", "organisation", "développement personnel", "télétravail"],
  },
  creativity: {
    en: [
      "art",
      "photography",
      "creativity",
      "drawing",
      "film making",
      "music production",
      "writing",
    ],
    fr: ["art", "photographie", "créativité", "dessin", "cinéma"],
  },
  science: {
    en: ["science", "space", "physics", "biology", "climate", "neuroscience", "astronomy"],
    fr: ["science", "espace", "astronomie", "physique", "climat", "biologie"],
  },
  finance: {
    en: ["personal finance", "investing", "economics", "stock market", "crypto", "markets"],
    fr: ["finance", "bourse", "économie", "investissement", "finances personnelles"],
  },
  news: {
    en: [
      "world news",
      "politics",
      "international news",
      "geopolitics",
      "europe news",
      "africa news",
    ],
    fr: ["actualité", "international", "politique", "géopolitique", "afrique", "maroc"],
  },
  culture: {
    en: ["culture", "books", "philosophy", "history", "movies", "long reads"],
    fr: ["culture", "livres", "philosophie", "histoire", "cinéma"],
  },
  health: {
    en: [
      "fitness",
      "nutrition",
      "running",
      "strength training",
      "mental health",
      "sleep",
      "wellness",
    ],
    fr: ["santé", "fitness", "nutrition", "course à pied", "musculation", "bien-être"],
  },
  food: {
    en: ["recipes", "cooking", "baking", "food", "vegetarian recipes", "restaurants"],
    fr: ["recettes", "cuisine", "pâtisserie", "gastronomie", "cuisine marocaine"],
  },
  travel: {
    en: ["travel", "travel tips", "backpacking", "digital nomad", "travel photography"],
    fr: ["voyage", "tourisme", "road trip", "voyager pas cher"],
  },
  gaming: {
    en: ["video games", "gaming news", "indie games", "playstation", "nintendo", "esports"],
    fr: ["jeux vidéo", "gaming", "jeux indé", "esport"],
  },
  sports: {
    en: ["football", "soccer", "formula 1", "basketball", "tennis", "cycling"],
    fr: ["football", "sport", "formule 1", "tennis", "rugby", "botola"],
  },
};

/** The search for page `page` of a category, alternating between languages. */
function keywordFor(category: CatalogCategoryId, langs: Language[], page: number) {
  const lists = langs.map((lang) => KEYWORDS[category][lang]);
  const longest = Math.max(...lists.map((l) => l.length));
  const merged: { word: string; lang: Language }[] = [];
  for (let i = 0; i < longest; i++) {
    langs.forEach((lang, j) => {
      const word = lists[j][i];
      if (word) merged.push({ word, lang });
    });
  }
  return { keyword: merged[page], hasMore: page + 1 < merged.length };
}

export interface ExplorePage {
  results: DiscoverResult[];
  hasMore: boolean;
}

export async function exploreCategory(
  category: CatalogCategoryId,
  kind: DiscoverKind,
  langs: Language[],
  page: number
): Promise<ExplorePage> {
  const { keyword, hasMore } = keywordFor(category, langs, page);
  if (!keyword) return { results: [], hasMore: false };
  const { word, lang } = keyword;

  const searches: Promise<DiscoverResult[]>[] = [];
  if (kind === "youtube" || kind === "all") {
    searches.push(searchYouTubeChannels(lang === "fr" ? `${word} français` : word));
  }
  if (kind === "rss" || kind === "all") searches.push(searchFeedly(word, lang));
  if (kind === "newsletter" || kind === "all") {
    // Feedly only knows a feed is a newsletter from its host (substack.com…).
    searches.push(searchFeedly(`substack ${word}`, lang));
    searches.push(searchFeedly(`${word} newsletter`, lang));
  }

  const settled = await Promise.allSettled(searches);
  const found = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const results = dedupe(
    found
      .filter((r) => inScope(kind, r.kind))
      .filter((r) => !r.lang || langs.includes(r.lang as Language))
      // Tiny feeds are mostly abandoned; YouTube results have no reader count.
      .filter((r) => r.provider === "youtube" || (r.followers ?? 0) >= 20)
      .sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0))
  ).map((r) => ({ ...r, lang: r.lang ?? lang }));

  const followed = await followedKeys();
  return { results: markFollowing(results, followed), hasMore };
}
