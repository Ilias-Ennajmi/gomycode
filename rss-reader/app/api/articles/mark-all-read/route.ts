import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { feedId, categoryId } = body as { feedId?: string; categoryId?: string };

    const where: { isRead: boolean; feedId?: string; feed?: { categoryId: string } } = {
      isRead: false,
    };

    if (feedId) where.feedId = feedId;
    if (categoryId) where.feed = { categoryId };

    const result = await prisma.article.updateMany({
      where,
      data: { isRead: true, readAt: new Date() },
    });

    return NextResponse.json({ updated: result.count });
  } catch (error) {
    console.error("POST /api/articles/mark-all-read failed", error);
    return NextResponse.json({ error: "Failed to mark articles read" }, { status: 500 });
  }
}
