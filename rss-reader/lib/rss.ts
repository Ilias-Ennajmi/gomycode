import Parser from "rss-parser";
import { youTubeThumbnailUrl, youTubeVideoId } from "@/lib/youtube";

type CustomFeed = {
  image?: { url?: string };
  language?: string;
  generator?: string;
};

type MediaNode = { $?: { url?: string; medium?: string } };

type XmlText = string | string[] | { _?: string } | Array<{ _?: string }>;

type CustomItem = {
  "content:encoded"?: string;
  "media:group"?: { "media:description"?: XmlText };
  "media:content"?: MediaNode | MediaNode[];
  "media:thumbnail"?: { $?: { url?: string } };
  enclosure?: { url?: string; type?: string };
  author?: string;
  "dc:creator"?: string;
};

const parser = new Parser<CustomFeed, CustomItem>({
  timeout: 15000,
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; RSSReaderBot/1.0)",
  },
  customFields: {
    feed: ["image", "language", "generator"],
    item: [
      ["content:encoded", "content:encoded"],
      ["media:content", "media:content"],
      ["media:thumbnail", "media:thumbnail"],
      ["media:group", "media:group"],
      ["dc:creator", "dc:creator"],
    ],
  },
});

export interface ParsedFeedMeta {
  title: string;
  description?: string;
  siteUrl?: string;
  coverUrl?: string;
  /** Two-letter code from <language>, e.g. "fr". */
  language?: string;
  generator?: string;
}

export interface ParsedArticle {
  title: string;
  link: string;
  summary?: string;
  content?: string;
  imageUrl?: string;
  author?: string;
  publishedAt: Date;
  isVideo?: boolean;
}

export interface ParsedFeed {
  meta: ParsedFeedMeta;
  articles: ParsedArticle[];
}

function xmlText(value: XmlText | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first === "string") return first;
  return first?._;
}

function firstImageFromHtml(html?: string): string | undefined {
  if (!html) return undefined;
  return html.match(/<img[^>]+src=["']([^"'>]+)["']/i)?.[1];
}

function extractImageUrl(item: Parser.Item & CustomItem): string | undefined {
  if (item.enclosure?.url && (!item.enclosure.type || item.enclosure.type.startsWith("image"))) {
    return item.enclosure.url;
  }

  const media = item["media:content"];
  if (media) {
    const withUrl = (Array.isArray(media) ? media : [media]).find((m) => m?.$?.url);
    if (withUrl?.$?.url) return withUrl.$.url;
  }

  const thumb = item["media:thumbnail"];
  if (thumb?.$?.url) return thumb.$.url;

  return firstImageFromHtml(item["content:encoded"] || item.content);
}

export async function fetchAndParseFeed(url: string): Promise<ParsedFeed> {
  const feed = await parser.parseURL(url);

  const meta: ParsedFeedMeta = {
    title: feed.title?.trim() || url,
    description: feed.description?.trim() || undefined,
    siteUrl: feed.link || undefined,
    coverUrl: feed.image?.url || undefined,
    language: feed.language?.trim().slice(0, 2).toLowerCase() || undefined,
    generator: feed.generator?.trim() || undefined,
  };

  const articles: ParsedArticle[] = (feed.items || [])
    .filter((item) => item.link)
    .map((item) => {
      const rawDate = item.isoDate || item.pubDate;
      const publishedAt = rawDate ? new Date(rawDate) : new Date();
      const videoId = youTubeVideoId(item.link);
      const content = videoId ? undefined : item["content:encoded"] || item.content || undefined;
      const summary = videoId
        ? xmlText(item["media:group"]?.["media:description"])
        : item.contentSnippet || item.summary || undefined;

      return {
        title: item.title?.trim() || "Untitled",
        link: item.link as string,
        summary: summary ? summary.slice(0, 500) : undefined,
        content,
        imageUrl: videoId ? youTubeThumbnailUrl(videoId) : extractImageUrl(item),
        author: item.author || item["dc:creator"] || item.creator || undefined,
        publishedAt: isNaN(publishedAt.getTime()) ? new Date() : publishedAt,
        isVideo: Boolean(videoId),
      };
    });

  return { meta, articles };
}

/**
 * Resolves an arbitrary URL (site or feed) to an RSS/Atom feed URL by
 * inspecting <link rel="alternate"> tags. Returns the input if it already
 * parses as a feed.
 */
export async function discoverFeedUrl(inputUrl: string): Promise<string> {
  try {
    await parser.parseURL(inputUrl);
    return inputUrl;
  } catch {
    // Not directly a feed — look for one in the page's HTML.
  }

  const res = await fetch(inputUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; RSSReaderBot/1.0)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Could not fetch URL (status ${res.status})`);

  const html = await res.text();
  const tags = html.match(/<link\s+[^>]*rel=["']alternate["'][^>]*>/gi) || [];

  for (const tag of tags) {
    const type = tag.match(/type=["']([^"']+)["']/i)?.[1] || "";
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (href && /rss|atom|xml/.test(type)) {
      return new URL(href, inputUrl).toString();
    }
  }

  throw new Error("No RSS feed found at this URL");
}
