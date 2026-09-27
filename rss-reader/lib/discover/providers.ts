import { isYouTubeFeedUrl, channelFeedUrl } from "@/lib/youtube";
import { isNewsletterUrl } from "@/lib/feed-source";
import type { SourceKind } from "@/lib/discover/catalog";

/** One source you could follow, from any provider. */
export interface DiscoverResult {
  /** What gets followed: a feed URL, or a site / channel URL we resolve. */
  url: string;
  name: string;
  kind: SourceKind;
  lang?: string;
  description?: string;
  imageUrl?: string;
  siteUrl?: string;
  /** Follower count (Feedly readers), used for ranking. */
  followers?: number;
  /** Human text such as "58.8K subscribers" when there's no exact count. */
  followersLabel?: string;
  provider: "catalog" | "feedly" | "youtube" | "link" | "ai" | "topic";
  /** Catalog category name, used to file the feed when followed. */
  category?: string;
  /** Why the AI suggested it. */
  reason?: string;
  following?: boolean;
  /** News tab section to file the source under. */
  newsDesk?: string;
  region?: string;
}

const TIMEOUT_MS = 6000;
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
  // Skips YouTube's EU consent page.
  Cookie: "SOCS=CAI; CONSENT=YES+1",
};

function kindForFeedUrl(url: string): SourceKind {
  if (isYouTubeFeedUrl(url)) return "youtube";
  return isNewsletterUrl(url) ? "newsletter" : "rss";
}

interface FeedlyFeed {
  feedId?: string;
  title?: string;
  description?: string;
  website?: string;
  iconUrl?: string;
  visualUrl?: string;
  subscribers?: number;
  language?: string;
}

/** Feedly's public feed search: covers blogs, news sites and most newsletters. */
export async function searchFeedly(query: string, locale?: string): Promise<DiscoverResult[]> {
  const params = new URLSearchParams({ query, count: "20" });
  if (locale) params.set("locale", locale);
  const res = await fetch(`https://cloud.feedly.com/v3/search/feeds?${params}`, {
    headers: { "User-Agent": BROWSER_HEADERS["User-Agent"], Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Feedly search failed (${res.status})`);
  const body = (await res.json()) as { results?: FeedlyFeed[] };

  return (body.results ?? []).flatMap((feed) => {
    const url = feed.feedId?.replace(/^feed\//, "");
    if (!url || !/^https?:\/\//.test(url) || !feed.title) return [];
    // Feedly still lists YouTube's retired pre-2015 feeds; channels come from YouTube search.
    if (/gdata\.youtube\.com/.test(url) || /\(uploads\) on YouTube/i.test(feed.title)) return [];
    return [
      {
        url,
        name: feed.title,
        kind: kindForFeedUrl(url),
        lang: feed.language?.slice(0, 2).toLowerCase(),
        description: feed.description,
        imageUrl: feed.iconUrl || feed.visualUrl,
        siteUrl: feed.website,
        followers: feed.subscribers,
        provider: "feedly" as const,
      },
    ];
  });
}

type YtText = { simpleText?: string; runs?: { text?: string }[] };

interface ChannelRenderer {
  channelId?: string;
  title?: YtText;
  descriptionSnippet?: YtText;
  subscriberCountText?: YtText;
  videoCountText?: YtText;
  thumbnail?: { thumbnails?: { url?: string }[] };
}

function ytText(text?: YtText) {
  return text?.simpleText ?? text?.runs?.map((r) => r.text ?? "").join("") ?? "";
}

function findChannels(node: unknown, found: ChannelRenderer[]) {
  if (!node || typeof node !== "object" || found.length >= 12) return;
  if ("channelRenderer" in node) {
    found.push((node as { channelRenderer: ChannelRenderer }).channelRenderer);
    return;
  }
  for (const value of Object.values(node)) findChannels(value, found);
}

/** YouTube's channel search, read from the results page (no API key needed). */
export async function searchYouTubeChannels(query: string): Promise<DiscoverResult[]> {
  // sp=EgIQAg== limits results to channels.
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAg%253D%253D`;
  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`YouTube search failed (${res.status})`);
  const html = await res.text();
  const json = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/)?.[1];
  if (!json) throw new Error("YouTube search returned an unexpected page");

  const channels: ChannelRenderer[] = [];
  findChannels(JSON.parse(json), channels);

  return channels.flatMap((channel) => {
    if (!channel.channelId) return [];
    // YouTube shows the @handle and subscriber count in either of these fields.
    const counts = [ytText(channel.subscriberCountText), ytText(channel.videoCountText)];
    const followersLabel = counts.find((text) => /subscri|abonn/i.test(text));
    const thumb = channel.thumbnail?.thumbnails?.at(-1)?.url;
    return [
      {
        url: channelFeedUrl(channel.channelId),
        name: ytText(channel.title) || "YouTube channel",
        kind: "youtube" as const,
        description: ytText(channel.descriptionSnippet) || undefined,
        imageUrl: thumb?.startsWith("//") ? `https:${thumb}` : thumb,
        followersLabel,
        followers: parseCount(followersLabel),
        provider: "youtube" as const,
      },
    ];
  });
}

/** "58.8K subscribers" → 58800. */
export function parseCount(label?: string) {
  const match = label?.replace(",", ".").match(/([\d.]+)\s*([KkMm]|k|M|Md|B)?/);
  if (!match) return undefined;
  const scale = { k: 1e3, K: 1e3, m: 1e6, M: 1e6, B: 1e9, Md: 1e9 }[match[2] ?? ""] ?? 1;
  return Math.round(parseFloat(match[1]) * scale);
}
