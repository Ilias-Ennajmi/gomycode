import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getFilterRules, hiddenArticleClauses } from "@/lib/filters";
import { buildReadingProfile, scoreArticle } from "@/lib/ranking";
import {
  ARTICLE_FEED_INCLUDE,
  categoryFilter,
  newsFilter,
  newsletterFilter,
  notSnoozed,
  parseSource,
  serializeArticle,
  sinceDate,
  sourceFilter,
} from "@/lib/articles";
import { searchArticleIds } from "@/lib/search";
import { sqlName } from "@/lib/db";

export const dynamic = "force-dynamic";

const FOR_YOU_WINDOW_MS = 72 * 60 * 60 * 1000;
const FOR_YOU_CANDIDATES = 400;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const feedId = searchParams.get("feedId") || undefined;
    const categoryId = searchParams.get("categoryId") || undefined;
    const saved = searchParams.get("saved") === "true";
    const today = searchParams.get("today") === "true";
    const unread = searchParams.get("unread") === "true";
    const forYou = searchParams.get("view") === "foryou";
    const source = parseSource(searchParams.get("source"));
    // Read Later: "later" is the queue, "archive" what was marked done.
    const later = searchParams.get("later");
    const search = searchParams.get("search")?.trim() || undefined;
    const news = searchParams.get("news") || undefined;
    const newsletter = newsletterFilter(searchParams.get("newsletter"));
    const since = sinceDate(searchParams.get("since"));
    const highlighted = searchParams.get("highlighted") === "true";
    const sort = searchParams.get("sort") === "oldest" ? "asc" : "desc";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20));

    const rules = await getFilterRules();
    const where: Prisma.ArticleWhereInput = {};

    if (feedId) where.feedId = feedId;
    if (categoryId) Object.assign(where, categoryFilter(categoryId));
    if (saved) where.isSaved = true;
    if (later === "queue") Object.assign(where, { isSaved: true, archivedAt: null });
    if (later === "archive") where.archivedAt = { not: null };
    if (later === "snoozed") where.snoozedUntil = { gt: new Date() };
    if (unread) where.isRead = false;
    if (today) where.publishedAt = { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) };
    if (forYou && !search) where.publishedAt = { gte: new Date(Date.now() - FOR_YOU_WINDOW_MS) };
    if (since) where.publishedAt = { gte: since };
    if (highlighted) where.highlights = { some: {} };

    const clauses: Prisma.ArticleWhereInput[] = hiddenArticleClauses(rules, feedId);
    const sourceClause = source && sourceFilter(source);
    if (sourceClause) clauses.push(sourceClause);
    if (news) clauses.push(newsFilter(news));
    if (newsletter) clauses.push(newsletter);
    if (later !== "snoozed") clauses.push(notSnoozed());
    if (clauses.length > 0) where.AND = clauses;

    if (search) {
      // Ranked by relevance: the matching ids come back best first, the filters narrow them.
      const ranked = await searchArticleIds(search);
      const matches = await prisma.article.findMany({
        where: { ...where, id: { in: ranked } },
        include: ARTICLE_FEED_INCLUDE,
      });
      const order = new Map(ranked.map((id, i) => [id, i]));
      matches.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
      const start = (page - 1) * limit;
      return NextResponse.json({
        articles: matches.slice(start, start + limit).map(serializeArticle),
        total: matches.length,
        page,
        limit,
        hasMore: start + limit < matches.length,
      });
    }

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

    const laterOrder =
      later === "archive" ? "archivedAt" : later === "snoozed" ? "snoozedUntil" : "savedAt";
    const [total, articles, minutes] = await Promise.all([
      prisma.article.count({ where }),
      prisma.article.findMany({
        where,
        orderBy: later
          ? { [laterOrder]: later === "snoozed" ? "asc" : sort }
          : { publishedAt: sort },
        skip: (page - 1) * limit,
        take: limit,
        include: ARTICLE_FEED_INCLUDE,
      }),
      // The Later queue shows how long it all takes to read.
      later === "queue" && page === 1 ? laterQueueMinutes() : Promise.resolve(undefined),
    ]);

    return NextResponse.json({
      articles: articles.map(serializeArticle),
      total,
      minutes,
      page,
      limit,
      hasMore: page * limit < total,
    });
  } catch (error) {
    console.error("GET /api/articles failed", error);
    return NextResponse.json({ error: "Failed to load articles" }, { status: 500 });
  }
}

/** Minutes to read everything in the Later queue (~220 words a minute, ~6 characters a word). */
async function laterQueueMinutes() {
  const rows = await prisma.$queryRaw<{ chars: bigint | null }[]>(Prisma.sql`
    SELECT sum(length(regexp_replace(coalesce("fullContent", "content", "summary", ''), '<[^>]*>', ' ', 'g'))) AS chars
    FROM ${sqlName("Article")}
    WHERE "isSaved" AND "archivedAt" IS NULL AND ("snoozedUntil" IS NULL OR "snoozedUntil" <= now())
  `);
  return Math.round(Number(rows[0]?.chars ?? 0) / 6 / 220);
}
