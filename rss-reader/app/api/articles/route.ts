import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const isPostgres = (process.env.DATABASE_URL || "").startsWith("postgres");
const stringFilterMode = isPostgres
  ? ({ mode: "insensitive" } as const)
  : ({} as const);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const feedId = searchParams.get("feedId") || undefined;
    const categoryId = searchParams.get("categoryId") || undefined;
    const saved = searchParams.get("saved") === "true";
    const today = searchParams.get("today") === "true";
    const unread = searchParams.get("unread") === "true";
    const search = searchParams.get("search")?.trim() || undefined;
    const sort = searchParams.get("sort") === "oldest" ? "asc" : "desc";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20)
    );

    const where: Prisma.ArticleWhereInput = {};

    if (feedId) where.feedId = feedId;
    if (categoryId) where.feed = { categoryId };
    if (saved) where.isSaved = true;
    if (unread) where.isRead = false;
    if (today) {
      where.publishedAt = { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) };
    }
    if (search) {
      where.OR = [
        { title: { contains: search, ...stringFilterMode } },
        { summary: { contains: search, ...stringFilterMode } },
      ];
    }

    const [total, articles] = await Promise.all([
      prisma.article.count({ where }),
      prisma.article.findMany({
        where,
        orderBy: { publishedAt: sort },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          feed: {
            select: { id: true, title: true, faviconUrl: true, categoryId: true },
          },
        },
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
