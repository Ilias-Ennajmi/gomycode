import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { savedLinksFeed } from "@/lib/saved-links";
import { extractPage } from "@/lib/extract";
import { normalizeInputUrl } from "@/lib/feed-source";
import { isYouTubeUrl, youTubeThumbnailUrl, youTubeVideoId } from "@/lib/youtube";
import { ARTICLE_FEED_INCLUDE, serializeArticle } from "@/lib/articles";

export const maxDuration = 30;

/** The same page may be stored with the other scheme or a trailing slash. */
function linkVariants(url: string) {
  const other = url.startsWith("https://")
    ? `http://${url.slice(8)}`
    : `https://${url.replace(/^http:\/\//, "")}`;
  const toggleSlash = (u: string) => (u.endsWith("/") ? u.slice(0, -1) : `${u}/`);
  return [url, other, toggleSlash(url), toggleSlash(other)];
}

/** Saves any web page to Read Later, extracting its readable text. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const input = typeof body.url === "string" ? body.url.trim() : "";
  let url: string;
  try {
    url = new URL(normalizeInputUrl(input)).toString();
  } catch {
    return NextResponse.json({ error: "Enter a valid link" }, { status: 400 });
  }

  const now = new Date();
  // Already in the app (from a feed or saved before): just queue it again.
  const existing = await prisma.article.findFirst({ where: { link: { in: linkVariants(url) } } });
  if (existing) {
    const article = await prisma.article.update({
      where: { id: existing.id },
      data: { isSaved: true, savedAt: now, archivedAt: null },
      include: ARTICLE_FEED_INCLUDE,
    });
    return NextResponse.json({ article: serializeArticle(article), existed: true });
  }

  const page = await extractPage(url).catch((error) => {
    console.error("Could not extract", url, error);
    return null;
  });
  const videoId = isYouTubeUrl(url) ? youTubeVideoId(url) : null;
  const feed = await savedLinksFeed();
  const article = await prisma.article.create({
    data: {
      feedId: feed.id,
      title: page?.title ?? new URL(url).hostname,
      link: url,
      summary: page?.excerpt ?? null,
      content: videoId ? null : (page?.content ?? null),
      imageUrl: videoId ? youTubeThumbnailUrl(videoId) : (page?.imageUrl ?? null),
      author: page?.author ?? page?.siteName ?? null,
      publishedAt: page?.publishedAt ?? now,
      isVideo: Boolean(videoId),
      isSaved: true,
      savedAt: now,
    },
    include: ARTICLE_FEED_INCLUDE,
  });
  return NextResponse.json({ article: serializeArticle(article), existed: false }, { status: 201 });
}
