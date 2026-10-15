import Parser from "rss-parser";
import {
  channelIdFromFeedUrl,
  fetchChannelVideos,
  youTubeThumbnailUrl,
  youTubeVideoId,
} from "@/lib/youtube";
import { unwrapBingLink } from "@/lib/discover/topics";

// Feed-level fields come straight from xml2js, so any of them can be a string,
// an array of strings, or an object ({ _: text } / { url } / { $: { href } }).
type CustomFeed = {
  image?: unknown;
  "itunes:image"?: unknown;
  language?: unknown;
  generator?: unknown;
};

type MediaNode = { $?: { url?: string; medium?: string } };

type CustomItem = {
  "content:encoded"?: string;
  "media:group"?: { "media:description"?: unknown };
  "media:content"?: MediaNode | MediaNode[];
  "media:thumbnail"?: { $?: { url?: string } };
  enclosure?: { url?: string; type?: string; length?: string };
  // Podcasts (read whether or not the feed declares the itunes namespace).
  itunesDuration?: unknown;
  itunesImage?: unknown;
  itunesSummary?: unknown;
  author?: unknown;
  "dc:creator"?: unknown;
  // Bing News search feeds (topic follows).
  "News:Image"?: unknown;
  "News:Source"?: unknown;
};

const parser = new Parser<CustomFeed, CustomItem>({
  customFields: {
    feed: ["image", "language", "generator", "itunes:image"],
    item: [
      ["content:encoded", "content:encoded"],
      ["media:content", "media:content"],
      ["media:thumbnail", "media:thumbnail"],
      ["media:group", "media:group"],
      ["dc:creator", "dc:creator"],
      ["News:Image", "News:Image"],
      ["News:Source", "News:Source"],
      ["itunes:duration", "itunesDuration"],
      ["itunes:image", "itunesImage"],
      ["itunes:summary", "itunesSummary"],
    ],
  },
});

// Some sites refuse unknown bots, so we look like a browser that reads feeds.
const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/124.0 Safari/537.36 RSSReader/1.0",
  Accept:
    "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, text/html;q=0.8, */*;q=0.5",
  "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
};
const TIMEOUT_MS = 15000;

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
  /** Podcast episodes: the audio file, its type and length. */
  audioUrl?: string;
  audioType?: string;
  durationSeconds?: number;
}

export interface ParsedFeed {
  meta: ParsedFeedMeta;
  articles: ParsedArticle[];
}

/** The first piece of text in an xml2js value, whatever shape it came in. */
export function firstText(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) return firstText(value[0]);
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    const node = value as Record<string, unknown> & { $?: Record<string, unknown> };
    return firstText(node._ ?? node.url ?? node.name ?? node.href ?? node.$?.href);
  }
  return undefined;
}

/** Decodes a response using the charset from its header or XML declaration. */
async function readText(res: Response) {
  const bytes = new Uint8Array(await res.arrayBuffer());
  let charset = res.headers.get("content-type")?.match(/charset=["']?([\w-]+)/i)?.[1];
  if (!charset) {
    const head = new TextDecoder("latin1").decode(bytes.slice(0, 300));
    charset = head.match(/encoding=["']([\w-]+)["']/i)?.[1];
  }
  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

async function download(url: string) {
  const res = await fetch(url, {
    headers: REQUEST_HEADERS,
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Could not fetch URL (status ${res.status})`);
  return { text: await readText(res), finalUrl: res.url || url };
}

/** Titles sometimes carry markup (Atom type="html"); readers want plain text. */
function plainTitle(value: unknown) {
  return firstText(value)
    ?.replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeFeed(text: string) {
  return /<(rss|feed|rdf:RDF)[\s>]/i.test(text.slice(0, 5000));
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

  const newsImage = firstText(item["News:Image"]);
  if (newsImage) return newsImage;

  return firstImageFromHtml(item["content:encoded"] || item.content);
}

/** An episode's audio file: an audio enclosure (or an .mp3/.m4a link when the type is missing). */
function audioEnclosure(item: CustomItem) {
  const url = item.enclosure?.url?.trim();
  if (!url) return null;
  const type = item.enclosure?.type?.toLowerCase() ?? "";
  if (type.startsWith("audio/")) return { url, type };
  if (!type && /\.(mp3|m4a|aac|ogg|opus|wav)(\?|$)/i.test(url)) return { url, type: "audio/mpeg" };
  return null;
}

/** <itunes:duration>: "1:02:03", "62:03", or seconds. */
export function parseDuration(value: unknown): number | undefined {
  const text = firstText(value);
  if (!text) return undefined;
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text)) || undefined;
  const parts = text.split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n)) || parts.length > 3) return undefined;
  return parts.reduce((total, n) => total * 60 + n, 0) || undefined;
}

/** An itunes:image node: <itunes:image href="…"/>. */
function itunesImageUrl(value: unknown): string | undefined {
  const node = Array.isArray(value) ? value[0] : value;
  if (node && typeof node === "object") {
    const href = (node as { $?: { href?: unknown } }).$?.href;
    if (typeof href === "string" && href.trim()) return href.trim();
  }
  return firstText(value);
}

async function parseFeedXml(xml: string, url: string): Promise<ParsedFeed> {
  const feed = await parser.parseString(xml);
  const image = feed.image as unknown;

  // Podcasts: the show's square artwork is the best picture of it.
  const artwork = itunesImageUrl(feed["itunes:image"]);
  const meta: ParsedFeedMeta = {
    title: plainTitle(feed.title) || url,
    description: firstText(feed.description),
    siteUrl: firstText(feed.link),
    coverUrl:
      artwork ||
      firstText(
        image && typeof image === "object" && !Array.isArray(image)
          ? (image as { url?: unknown }).url
          : image
      ),
    language: firstText(feed.language)?.slice(0, 2).toLowerCase(),
    generator: firstText(feed.generator),
  };

  const articles: ParsedArticle[] = (feed.items || [])
    .filter((item) => firstText(item.link) || audioEnclosure(item))
    .map((item) => {
      const audio = audioEnclosure(item);
      // Episodes without a page of their own are known by their audio file.
      const link = unwrapBingLink((firstText(item.link) || audio?.url) as string);
      const rawDate = item.isoDate || item.pubDate;
      const publishedAt = rawDate ? new Date(rawDate) : new Date();
      const videoId = youTubeVideoId(link);
      const content = videoId
        ? undefined
        : item["content:encoded"] || item.content || firstText(item.itunesSummary) || undefined;
      const summary = videoId
        ? firstText(item["media:group"]?.["media:description"])
        : firstText(item.contentSnippet) ||
          firstText(item.summary) ||
          firstText(item.itunesSummary)?.replace(/<[^>]+>/g, " ");

      return {
        title: plainTitle(item.title) || "Untitled",
        link,
        summary: summary ? summary.slice(0, 500) : undefined,
        content,
        imageUrl: videoId
          ? youTubeThumbnailUrl(videoId)
          : audio
            ? itunesImageUrl(item.itunesImage) || extractImageUrl(item) || artwork
            : extractImageUrl(item),
        author:
          firstText(item.author) ||
          firstText(item["dc:creator"]) ||
          firstText(item.creator) ||
          firstText(item["News:Source"]),
        publishedAt: isNaN(publishedAt.getTime()) ? new Date() : publishedAt,
        isVideo: Boolean(videoId),
        ...(audio && !videoId
          ? {
              audioUrl: audio.url,
              audioType: audio.type,
              durationSeconds: parseDuration(item.itunesDuration),
            }
          : {}),
      };
    });

  return { meta, articles };
}

export async function fetchAndParseFeed(url: string): Promise<ParsedFeed> {
  const channelId = channelIdFromFeedUrl(url);
  try {
    const { text } = await download(url);
    return await parseFeedXml(text, url);
  } catch (error) {
    // YouTube's RSS endpoint goes down for hours at a time; the channel page still works.
    if (!channelId) throw error;
    return channelPageFeed(channelId);
  }
}

async function channelPageFeed(channelId: string): Promise<ParsedFeed> {
  const channel = await fetchChannelVideos(channelId);
  return {
    meta: {
      title: channel.title,
      description: channel.description,
      siteUrl: `https://www.youtube.com/channel/${channelId}`,
      coverUrl: channel.avatarUrl,
    },
    articles: channel.videos.map((video) => ({
      title: video.title,
      link: `https://www.youtube.com/watch?v=${video.videoId}`,
      imageUrl: youTubeThumbnailUrl(video.videoId),
      author: channel.title,
      publishedAt: video.publishedAt,
      isVideo: true,
    })),
  };
}

/**
 * Resolves an arbitrary URL (site or feed) to an RSS/Atom feed URL by
 * inspecting <link rel="alternate"> tags. Returns the input if it already
 * is a feed.
 */
export async function discoverFeedUrl(inputUrl: string): Promise<string> {
  const { text, finalUrl } = await download(inputUrl);
  if (looksLikeFeed(text)) return inputUrl;

  const tags = text.match(/<link\s+[^>]*rel=["']alternate["'][^>]*>/gi) || [];
  for (const tag of tags) {
    const type = tag.match(/type=["']([^"']+)["']/i)?.[1] || "";
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (href && /rss|atom|xml/.test(type)) {
      return new URL(href.replace(/&amp;/g, "&"), finalUrl).toString();
    }
  }

  throw new Error("No RSS feed found at this URL");
}
