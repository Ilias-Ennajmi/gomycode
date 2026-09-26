import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ARTICLE_FEED_INCLUDE, serializeArticle } from "@/lib/articles";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const article = await prisma.article.findUnique({
    where: { id: params.id },
    include: ARTICLE_FEED_INCLUDE,
  });
  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }
  return NextResponse.json({ article: serializeArticle(article) });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const { isRead, isSaved } = body as { isRead?: boolean; isSaved?: boolean };

    const article = await prisma.article.findUnique({ where: { id: params.id } });
    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    const data: {
      isRead?: boolean;
      readAt?: Date | null;
      isSaved?: boolean;
      savedAt?: Date | null;
    } = {};

    if (typeof isRead === "boolean") {
      data.isRead = isRead;
      data.readAt = isRead ? new Date() : null;
    }
    if (typeof isSaved === "boolean") {
      data.isSaved = isSaved;
      data.savedAt = isSaved ? new Date() : null;
    }

    const updated = await prisma.article.update({
      where: { id: params.id },
      data,
      include: ARTICLE_FEED_INCLUDE,
    });

    return NextResponse.json({ article: serializeArticle(updated) });
  } catch (error) {
    console.error("PATCH /api/articles/[id] failed", error);
    return NextResponse.json({ error: "Failed to update article" }, { status: 500 });
  }
}
