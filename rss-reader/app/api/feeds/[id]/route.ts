import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { keepSavedArticles } from "@/lib/saved-links";
import { isDesk } from "@/lib/news/desks";
import { reportProblem } from "@/lib/errlog";
import { BadRequest, badRequest, readJson } from "@/lib/http";

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const body = await readJson(request);
    const { title, categoryId, newsDesk, inForYou, fullPage } = body as {
      title?: string;
      categoryId?: string | null;
      /** A News section id to show the source in News, or null to take it out. */
      newsDesk?: string | null;
      inForYou?: boolean;
      fullPage?: boolean;
    };
    if (newsDesk !== undefined && newsDesk !== null && !isDesk(newsDesk)) {
      return NextResponse.json({ error: "Unknown News section" }, { status: 400 });
    }

    const feed = await prisma.feed.findUnique({ where: { id: params.id } });
    if (!feed) {
      return NextResponse.json({ error: "Feed not found" }, { status: 404 });
    }

    if (categoryId) {
      const category = await prisma.category.findUnique({ where: { id: categoryId } });
      if (!category) {
        return NextResponse.json({ error: "Category not found" }, { status: 404 });
      }
    }

    const updated = await prisma.feed.update({
      where: { id: params.id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(newsDesk !== undefined ? { newsDesk } : {}),
        ...(typeof inForYou === "boolean" ? { inForYou } : {}),
        ...(typeof fullPage === "boolean" ? { fullPage } : {}),
      },
    });

    return NextResponse.json({ feed: updated });
  } catch (error) {
    if (error instanceof BadRequest) return badRequest(error);
    await reportProblem("PATCH /api/feeds/[id]", error);
    return NextResponse.json({ error: "Failed to update feed" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const feed = await prisma.feed.findUnique({ where: { id: params.id } });
    if (!feed) {
      return NextResponse.json({ error: "Feed not found" }, { status: 404 });
    }

    // Saved and highlighted articles outlive the source.
    await keepSavedArticles(params.id);
    await prisma.feed.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof BadRequest) return badRequest(error);
    await reportProblem("DELETE /api/feeds/[id]", error);
    return NextResponse.json({ error: "Failed to delete feed" }, { status: 500 });
  }
}
