import { NextRequest, NextResponse } from "next/server";
import { FeedType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getFilterRules, hiddenArticleClauses } from "@/lib/filters";
import { scoreArticle } from "@/lib/ranking";

export const dynamic = "force-dynamic";

const FEED_SELECT = {
  feed: { select: { id: true, title: true, faviconUrl: true, categoryId: true } },
} as const;

const FOR_YOU_WINDOW_MS = 72 * 60 * 60 * 1000;
const FOR_YOU_CANDIDATES = 400;

/**
 * Source tabs go by the article as well as the feed, so a video from a feed
 * that wasn't recognised as YouTube still lands in YouTube, not RSS.
 */
function sourceFilter(source: FeedType): Prisma.ArticleWhereInput {
  if (source === "youtube") return { OR: [{ isVideo: true }, { feed: { type: "youtube" } }] };
  if (source === "rss") return { isVideo: false, feed: { type: "rss" } };
  return { feed: { type: source } };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const feedId = searchParams.get("feedId") || undefined;
    const categoryId = searchParams.get("categoryId") || undefined;
    const saved = searchParams.get("saved") === "true";
    const today = searchParams.get("today") === "true";
    const unread = searchParams.get("unread") === "true";
    const forYou = searchParams.get("view") === "foryou";
    const sourceParam = searchParams.get("source");
    const source =
      sourceParam && ["rss", "youtube", "newsletter"].includes(sourceParam)
        ? (sourceParam as FeedType)
        : undefined;
    const search = searchParams.get("search")?.trim() || undefined;
    const sort = searchParams.get("sort") === "oldest" ? "asc" : "desc";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20));

    const rules = await getFilterRules();
    const where: Prisma.ArticleWhereInput = {};

    if (feedId) where.feedId = feedId;
    if (categoryId) where.feed = { categoryId };
    if (saved) where.isSaved = true;
    if (unread) where.isRead = false;
    if (today) where.publishedAt = { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) };
    if (forYou && !search) where.publishedAt = { gte: new Date(Date.now() - FOR_YOU_WINDOW_MS) };
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { summary: { contains: search, mode: "insensitive" } },
      ];
    }

    const clauses: Prisma.ArticleWhereInput[] = hiddenArticleClauses(rules, feedId);
    const sourceClause = source && sourceFilter(source);
    if (sourceClause) clauses.push(sourceClause);
    if (clauses.length > 0) where.AND = clauses;

    if (forYou) {
      // Ranked in memory: one user's last 72 hours is a few hundred rows.
      const candidates = await prisma.article.findMany({
        where,
        orderBy: { publishedAt: "desc" },
        take: FOR_YOU_CANDIDATES,
        include: FEED_SELECT,
      });
      const now = Date.now();
      const ranked = candidates
        .map((article) => ({ article, ...scoreArticle(article, rules, now) }))
        .sort((a, b) => b.score - a.score);
      const start = (page - 1) * limit;

      return NextResponse.json({
        articles: ranked
          .slice(start, start + limit)
          .map(({ article, boosted }) => ({ ...article, boosted })),
        total: ranked.length,
        page,
        limit,
        hasMore: start + limit < ranked.length,
      });
    }

    const [total, articles] = await Promise.all([
      prisma.article.count({ where }),
      prisma.article.findMany({
        where,
        orderBy: { publishedAt: sort },
        skip: (page - 1) * limit,
        take: limit,
        include: FEED_SELECT,
      }),
    ]);

    return NextResponse.json({
      articles,
      total,
      page,
      limit,
      hasMore: page * limit < total,
    });
  } catch (error) {
    console.error("GET /api/articles failed", error);
    return NextResponse.json({ error: "Failed to load articles" }, { status: 500 });
  }
}
