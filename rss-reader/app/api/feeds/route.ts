import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { FollowError, followSource, type FollowInput } from "@/lib/follow";
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
      language: feed.language,
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
    const { url, categoryId, categoryName, language, kind } = body as FollowInput;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const { feed } = await followSource({ url, categoryId, categoryName, language, kind });
    await runAiPipeline();
    return NextResponse.json({ feed }, { status: 201 });
  } catch (error) {
    if (error instanceof FollowError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/feeds failed", error);
    return NextResponse.json({ error: "Failed to add feed" }, { status: 500 });
  }
}
