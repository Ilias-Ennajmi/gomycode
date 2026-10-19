import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { categoryFilter, parseSource, sourceFilter } from "@/lib/articles";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { feedId, categoryId, source, ids } = body as {
      feedId?: string;
      categoryId?: string;
      source?: string;
      /** A specific set (the catch-up's articles) instead of a scope. */
      ids?: string[];
    };

    const clauses: Prisma.ArticleWhereInput[] = [{ isRead: false }];
    if (Array.isArray(ids)) clauses.push({ id: { in: ids.slice(0, 200) } });
    if (feedId) clauses.push({ feedId });
    if (categoryId) clauses.push(categoryFilter(categoryId));
    const sourceType = parseSource(source);
    if (sourceType) clauses.push(sourceFilter(sourceType));

    const result = await prisma.article.updateMany({
      where: { AND: clauses },
      data: { isRead: true, readAt: new Date() },
    });

    return NextResponse.json({ updated: result.count });
  } catch (error) {
    console.error("POST /api/articles/mark-all-read failed", error);
    return NextResponse.json({ error: "Failed to mark articles read" }, { status: 500 });
  }
}
