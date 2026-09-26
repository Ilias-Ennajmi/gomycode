import { NextRequest, NextResponse } from "next/server";
import { FeedType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getFilterRules, hiddenArticleClauses } from "@/lib/filters";
import { buildReadingProfile, scoreArticle } from "@/lib/ranking";
import { ARTICLE_FEED_INCLUDE, serializeArticle } from "@/lib/articles";

export const dynamic = "force-dynamic";

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
    // Read Later: "later" is the queue, "archive" what was marked done.
    const later = searchParams.get("later");
    const search = searchParams.get("search")?.trim() || undefined;
    const sort = searchParams.get("sort") === "oldest" ? "asc" : "desc";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20));

    const rules = await getFilterRules();
    const where: Prisma.ArticleWhereInput = {};

    if (feedId) where.feedId = feedId;
    if (categoryId) where.feed = { categoryId };
    if (saved) where.isSaved = true;
    if (later === "queue") Object.assign(where, { isSaved: true, archivedAt: null });
    if (later === "archive") where.archivedAt = { not: null };
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
      const [candidates, profile] = await Promise.all([
        prisma.article.findMany({
          where: { ...where, isPromo: false, feed: { type: { not: "manual" } } },
          orderBy: { publishedAt: "desc" },
          take: FOR_YOU_CANDIDATES,
          include: ARTICLE_FEED_INCLUDE,
        }),
        buildReadingProfile(),
      ]);

      const topicSizes = new Map<string, number>();
      for (const a of candidates) {
        if (a.topicId) topicSizes.set(a.topicId, (topicSizes.get(a.topicId) ?? 0) + 1);
      }

      const now = Date.now();
      const ranked = candidates
        .map((article) => ({
          article,
          ...scoreArticle(article, rules, now, profile, topicSizes.get(article.topicId ?? "") ?? 1),
        }))
        .sort((a, b) => b.score - a.score);

      // One card per story: the best-ranked article leads, the rest of its
      // topic travels with it as "also covered by".
      const byTopic = new Map<string, typeof ranked>();
      for (const entry of ranked) {
        const topicId = entry.article.topicId;
        if (!topicId || (topicSizes.get(topicId) ?? 0) < 2) continue;
        byTopic.set(topicId, [...(byTopic.get(topicId) ?? []), entry]);
      }
      const seen = new Set<string>();
      const stories = ranked.flatMap(({ article, boosted }) => {
        const topicId = article.topicId;
        const group = topicId ? byTopic.get(topicId) : undefined;
        if (!group) return [{ ...serializeArticle(article), boosted }];
        if (seen.has(topicId!)) return [];
        seen.add(topicId!);
        const related = group.slice(1).map((e) => serializeArticle(e.article));
        return [
          {
            ...serializeArticle(article),
            boosted,
            topic: {
              id: topicId!,
              sources: Array.from(new Set(group.map((e) => e.article.feed.title))),
              related,
            },
          },
        ];
      });

      const start = (page - 1) * limit;
      return NextResponse.json({
        articles: stories.slice(start, start + limit),
        total: stories.length,
        page,
        limit,
        hasMore: start + limit < stories.length,
        learnedFrom: profile.learnedFrom,
      });
    }

    const [total, articles] = await Promise.all([
      prisma.article.count({ where }),
      prisma.article.findMany({
        where,
        orderBy: later
          ? { [later === "archive" ? "archivedAt" : "savedAt"]: sort }
          : { publishedAt: sort },
        skip: (page - 1) * limit,
        take: limit,
        include: ARTICLE_FEED_INCLUDE,
      }),
    ]);

    return NextResponse.json({
      articles: articles.map(serializeArticle),
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
