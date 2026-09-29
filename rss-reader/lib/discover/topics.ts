import type { Language } from "@/lib/discover/catalog";
import type { DiscoverResult } from "@/lib/discover/providers";

// "Follow a topic" and sites without a feed go through Bing News search RSS:
// it answers from Vercel, sorts by date, and carries each story's image and
// real URL (Google News links only resolve in a browser).

const BING_NEWS = "https://www.bing.com/news/search";

export function topicFeedUrl(query: string, lang: Language = "en") {
  const params = new URLSearchParams({
    q: query.trim(),
    format: "rss",
    setlang: lang,
    // The market keeps results in the reader's language (setlang alone doesn't).
    mkt: lang === "fr" ? "fr-FR" : "en-US",
    qft: 'sortbydate="1"',
  });
  return `${BING_NEWS}?${params}`;
}

/** The search behind a topic feed URL, or null for any other feed. */
export function topicQuery(url: string) {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)bing\.com$/.test(parsed.hostname) || parsed.pathname !== "/news/search") {
      return null;
    }
    return parsed.searchParams.get("q");
  } catch {
    return null;
  }
}

export function isTopicFeedUrl(url: string) {
  return topicQuery(url) !== null;
}

/** "site:medias24.com" → "medias24.com"; plain topics stay as typed. */
export function topicTitle(query: string) {
  const site = query.match(/^site:(\S+)$/i)?.[1];
  return site ?? query;
}

/** Bing wraps each story link in a click tracker; the real URL is its `url` param. */
export function unwrapBingLink(link: string) {
  try {
    const parsed = new URL(link);
    if (!/(^|\.)bing\.com$/.test(parsed.hostname)) return link;
    return parsed.searchParams.get("url") || link;
  } catch {
    return link;
  }
}

export function siteTopic(url: string) {
  try {
    const host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname;
    return `site:${host.replace(/^www\./, "")}`;
  } catch {
    return null;
  }
}

export function topicResult(query: string, lang: Language): DiscoverResult {
  const site = /^site:/i.test(query);
  return {
    url: topicFeedUrl(query, lang),
    name: site ? topicTitle(query) : `“${query.trim()}”`,
    kind: "rss",
    lang,
    description: site
      ? "Its latest stories, found through news search (the site has no feed we can read)"
      : "The latest news on this topic from across the web, newest first",
    provider: "topic",
    category: site ? undefined : "Topics",
  };
}
