import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchAndParseFeed, discoverFeedUrl } from "@/lib/rss";
import { discoverFaviconUrl } from "@/lib/favicon";

export async function GET() {
  try {
    const feeds = await prisma.feed.findMany({
      orderBy: { title: "asc" },
      include: {
        _count: {
          select: { articles: { where: { isRead: false } } },
        },
      },
    });

    const result = feeds.map((feed) => ({
      id: feed.id,
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

    let feedUrl: string;
    try {
      feedUrl = await discoverFeedUrl(url);
    } catch {
      return NextResponse.json(
        { error: "Could not find an RSS feed at this URL" },
        { status: 422 }
      );
    }

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

    let faviconUrl: string | undefined;
    try {
      faviconUrl = await discoverFaviconUrl(parsed.meta.siteUrl || feedUrl);
    } catch {
      faviconUrl = undefined;
    }

    if (categoryId) {
      const category = await prisma.category.findUnique({ where: { id: categoryId } });
      if (!category) {
        return NextResponse.json({ error: "Category not found" }, { status: 404 });
      }
    }

    const feed = await prisma.feed.create({
      data: {
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

    const uniqueArticles = Array.from(
      new Map(parsed.articles.map((article) => [article.link, article])).values()
    );

    if (uniqueArticles.length > 0) {
      await prisma.article.createMany({
        data: uniqueArticles.map((article) => ({
          feedId: feed.id,
          title: article.title,
          link: article.link,
          summary: article.summary,
          content: article.content,
          imageUrl: article.imageUrl,
          author: article.author,
          publishedAt: article.publishedAt,
        })),
      });
    }

    return NextResponse.json({ feed }, { status: 201 });
  } catch (error) {
    console.error("POST /api/feeds failed", error);
    return NextResponse.json({ error: "Failed to add feed" }, { status: 500 });
  }
}
