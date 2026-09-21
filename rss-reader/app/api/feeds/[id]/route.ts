import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { title, categoryId } = body as {
      title?: string;
      categoryId?: string | null;
    };

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
      },
    });

    return NextResponse.json({ feed: updated });
  } catch (error) {
    console.error("PATCH /api/feeds/[id] failed", error);
    return NextResponse.json({ error: "Failed to update feed" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const feed = await prisma.feed.findUnique({ where: { id: params.id } });
    if (!feed) {
      return NextResponse.json({ error: "Feed not found" }, { status: 404 });
    }

    await prisma.feed.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/feeds/[id] failed", error);
    return NextResponse.json({ error: "Failed to delete feed" }, { status: 500 });
  }
}
