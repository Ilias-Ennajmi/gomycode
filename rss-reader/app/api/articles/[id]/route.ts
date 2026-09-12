import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    });

    return NextResponse.json({ article: updated });
  } catch (error) {
    console.error("PATCH /api/articles/[id] failed", error);
    return NextResponse.json({ error: "Failed to update article" }, { status: 500 });
  }
}
