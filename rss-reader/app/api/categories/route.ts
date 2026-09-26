import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getFilterRules, hiddenKeywordClauses, mutedFeedIds } from "@/lib/filters";

export async function GET() {
  try {
    const rules = await getFilterRules();
    const muted = mutedFeedIds(rules);
    const categories = await prisma.category.findMany({
      orderBy: { order: "asc" },
      include: {
        feeds: {
          orderBy: { title: "asc" },
          include: {
            _count: {
              select: {
                articles: { where: { isRead: false, AND: hiddenKeywordClauses(rules) } },
              },
            },
          },
        },
      },
    });

    const result = categories.map((category) => ({
      id: category.id,
      name: category.name,
      color: category.color,
      icon: category.icon,
      order: category.order,
      feeds: category.feeds.map((feed) => ({
        id: feed.id,
        type: feed.type,
        muted: muted.has(feed.id),
        title: feed.title,
        url: feed.url,
        faviconUrl: feed.faviconUrl,
        errorCount: feed.errorCount,
        unreadCount: feed._count.articles,
      })),
      // Muted feeds are hidden from the category view, so they don't count here.
      unreadCount: category.feeds
        .filter((feed) => !muted.has(feed.id))
        .reduce((sum, feed) => sum + feed._count.articles, 0),
    }));

    return NextResponse.json({ categories: result });
  } catch (error) {
    console.error("GET /api/categories failed", error);
    return NextResponse.json({ error: "Failed to load categories" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, color, icon } = body as {
      name?: string;
      color?: string;
      icon?: string;
    };

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const maxOrder = await prisma.category.aggregate({ _max: { order: true } });

    const category = await prisma.category.create({
      data: {
        name: name.trim(),
        color: color || "#6366f1",
        icon: icon || null,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });

    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    console.error("POST /api/categories failed", error);
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}
