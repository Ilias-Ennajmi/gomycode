import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveSource } from "@/lib/feed-source";
import { fetchAndParseFeed } from "@/lib/rss";
import { stripHtml } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// A look inside a source before following it: its picture, description, how often it
// publishes, and its latest items. Nothing is saved. Kept a few minutes in memory, since
// opening, closing and reopening a preview is common.

export interface SourcePreviewItem {
  title: string;
  link: string;
  publishedAt: string;
  imageUrl: string | null;
  summary: string | null;
  audioUrl: string | null;
  durationSeconds: number | null;
  isVideo: boolean;
}

export interface SourcePreview {
  feedUrl: string;
  type: "rss" | "youtube" | "newsletter" | "podcast";
  title: string;
  description: string | null;
  coverUrl: string | null;
  siteUrl: string | null;
  language: string | null;
  /** Items a week over the latest ones, rounded; null when it can't be told. */
  perWeek: number | null;
  lastPublished: string | null;
  items: SourcePreviewItem[];
  /** Already followed here: the feed's id. */
  followedFeedId: string | null;
}

const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; preview: SourcePreview }>();

function perWeek(dates: Date[]) {
  const sorted = dates.map((d) => d.getTime()).sort((a, b) => b - a);
  if (sorted.length < 3) return null;
  const spanDays = (sorted[0] - sorted[sorted.length - 1]) / 86_400_000;
  if (spanDays < 1) return null;
  const value = (sorted.length - 1) / (spanDays / 7);
  return value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url")?.trim();
  const kind = request.nextUrl.searchParams.get("kind");
  if (!url) return NextResponse.json({ error: "Which source?" }, { status: 400 });

  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    const followed = await prisma.feed.findUnique({
      where: { url: hit.preview.feedUrl },
      select: { id: true },
    });
    return NextResponse.json({ ...hit.preview, followedFeedId: followed?.id ?? null });
  }

  try {
    const source = await resolveSource(url);
    const parsed = await fetchAndParseFeed(source.feedUrl);
    const articles = [...parsed.articles].sort(
      (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()
    );
    const episodes = articles.filter((a) => a.audioUrl).length;
    const type: SourcePreview["type"] =
      source.type !== "rss" && source.type !== "manual"
        ? source.type
        : articles.length > 0 && articles.every((a) => a.isVideo)
          ? "youtube"
          : kind === "podcast" || (episodes > 0 && episodes >= articles.length / 2)
            ? "podcast"
            : kind === "newsletter"
              ? "newsletter"
              : "rss";
    const followed = await prisma.feed.findUnique({
      where: { url: source.feedUrl },
      select: { id: true },
    });
    const preview: SourcePreview = {
      feedUrl: source.feedUrl,
      type,
      title: parsed.meta.title || url,
      description: parsed.meta.description
        ? stripHtml(parsed.meta.description).slice(0, 800)
        : null,
      coverUrl: parsed.meta.coverUrl ?? source.faviconUrl ?? null,
      siteUrl: parsed.meta.siteUrl ?? null,
      language: parsed.meta.language ?? null,
      perWeek: perWeek(articles.slice(0, 20).map((a) => a.publishedAt)),
      lastPublished: articles[0]?.publishedAt.toISOString() ?? null,
      items: articles.slice(0, 12).map((a) => ({
        title: a.title,
        link: a.link,
        publishedAt: a.publishedAt.toISOString(),
        imageUrl: a.imageUrl ?? null,
        summary: a.summary ? stripHtml(a.summary).slice(0, 220) : null,
        audioUrl: a.audioUrl ?? null,
        durationSeconds: a.durationSeconds ?? null,
        isVideo: Boolean(a.isVideo),
      })),
      followedFeedId: followed?.id ?? null,
    };
    cache.set(url, { at: Date.now(), preview });
    if (cache.size > 200) cache.delete(cache.keys().next().value as string);
    return NextResponse.json(preview);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("Source preview failed", url, message);
    return NextResponse.json(
      {
        error: /No RSS feed/i.test(message)
          ? "This site doesn't publish a feed"
          : /status 40[13]/.test(message)
            ? "This site blocks feed readers"
            : "Couldn't load a preview right now",
      },
      { status: 422 }
    );
  }
}
