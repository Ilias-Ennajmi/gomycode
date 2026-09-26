import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchAndParseFeed } from "@/lib/rss";
import { resolveSource, type ResolvedSource } from "@/lib/feed-source";
import { discoverFaviconUrl } from "@/lib/favicon";
import { insertNewArticles } from "@/lib/ingest";
import { runAiPipeline } from "@/lib/enrich";
import { getFilterRules, hiddenKeywordClauses, mutedFeedIds } from "@/lib/filters";

export async function GET() {
  try {
    const rules = await getFilterRules();
    const muted = mutedFeedIds(rules);
    const feeds = await prisma.feed.findMany({
      // Links saved to Read Later live in a hidden feed.
      where: { type: { not: "manual" } },
      orderBy: { title: "asc" },
      include: {
        _count: {
          select: {
            articles: { where: { isRead: false, AND: hiddenKeywordClauses(rules) } },
          },
        },
      },
    });

    const result = feeds.map((feed) => ({
      id: feed.id,
      type: feed.type,
      muted: muted.has(feed.id),
      title: feed.title,
      url: feed.url,
      siteUrl: feed.siteUrl,
      description: feed.description,
      faviconUrl: feed.faviconUrl,
      coverUrl: feed.coverUrl,
      categoryId: feed.categoryId,
      lastFetched: feed.lastFetched,
      errorCount: feed.errorCount,
      unreadCount: feed._count.articles,
    }));

    return NextResponse.json({ feeds: result });
  } catch (error) {
    console.error("GET /api/feeds failed", error);
    return NextResponse.json({ error: "Failed to load feeds" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, categoryId } = body as { url?: string; categoryId?: string };

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    let source: ResolvedSource;
    try {
      source = await resolveSource(url);
    } catch {
      return NextResponse.json(
        { error: "Could not find a feed or YouTube channel at this URL" },
        { status: 422 }
      );
    }
    const { feedUrl } = source;

    const existing = await prisma.feed.findUnique({ where: { url: feedUrl } });
    if (existing) {
      return NextResponse.json({ error: "This feed is already added" }, { status: 409 });
    }

    let parsed;
    try {
      parsed = await fetchAndParseFeed(feedUrl);
    } catch {
      return NextResponse.json(
        { error: "Could not fetch feed — check URL" },
        { status: 422 }
      );
    }

    const faviconUrl =
      source.faviconUrl ??
      (await discoverFaviconUrl(parsed.meta.siteUrl || feedUrl).catch(() => undefined));

    if (categoryId) {
      const category = await prisma.category.findUnique({ where: { id: categoryId } });
      if (!category) {
        return NextResponse.json({ error: "Category not found" }, { status: 404 });
      }
    }

    // A feed whose items are all YouTube videos is a channel, whatever its URL.
    const allVideos = parsed.articles.length > 0 && parsed.articles.every((a) => a.isVideo);
    const feed = await prisma.feed.create({
      data: {
        type: source.type === "rss" && allVideos ? "youtube" : source.type,
        title: parsed.meta.title,
        url: feedUrl,
        siteUrl: parsed.meta.siteUrl,
        description: parsed.meta.description,
        faviconUrl,
        coverUrl: parsed.meta.coverUrl,
        categoryId: categoryId || null,
        lastFetched: new Date(),
      },
    });

    await insertNewArticles(feed.id, parsed.articles);
    await runAiPipeline();

    return NextResponse.json({ feed }, { status: 201 });
  } catch (error) {
    console.error("POST /api/feeds failed", error);
    return NextResponse.json({ error: "Failed to add feed" }, { status: 500 });
  }
}
