import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HIGHLIGHT_ARTICLE_INCLUDE, cleanHighlightInput, parseColor } from "@/lib/highlights";

export const dynamic = "force-dynamic";

/**
 * ?articleId= lists one article's highlights (for the reader); without it, all highlights,
 * newest first, with their article, filtered by ?search= and ?color=.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const articleId = searchParams.get("articleId");
  if (articleId) {
    const highlights = await prisma.highlight.findMany({
      where: { articleId },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ highlights });
  }

  const search = searchParams.get("search")?.trim();
  const color = parseColor(searchParams.get("color"));
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "30", 10) || 30));

  const where: Prisma.HighlightWhereInput = {};
  if (color) where.color = color;
  if (search) {
    where.OR = [
      { text: { contains: search, mode: "insensitive" } },
      { note: { contains: search, mode: "insensitive" } },
      { article: { title: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [total, highlights] = await Promise.all([
    prisma.highlight.count({ where }),
    prisma.highlight.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: HIGHLIGHT_ARTICLE_INCLUDE,
    }),
  ]);
  return NextResponse.json({ highlights, total, page, hasMore: page * limit < total });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const articleId = typeof body.articleId === "string" ? body.articleId : "";
  const input = cleanHighlightInput(body);
  if (!articleId || !input) {
    return NextResponse.json({ error: "Select some text to highlight" }, { status: 400 });
  }
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: { id: true },
  });
  if (!article) return NextResponse.json({ error: "Article not found" }, { status: 404 });

  const highlight = await prisma.highlight.create({ data: { articleId, ...input } });
  return NextResponse.json({ highlight }, { status: 201 });
}
