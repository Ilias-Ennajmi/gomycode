import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { AiError, isQuotaError } from "@/lib/ai";
import { catchUp } from "@/lib/smart";
import { categoryFilter, newsFilter, parseSource, sourceFilter } from "@/lib/articles";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

/** Bullets over the unread articles of a feed, a category, a source tab or News. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    feedId?: string;
    categoryId?: string;
    source?: string;
    news?: string;
  };
  const where: Prisma.ArticleWhereInput = {};
  let label = "your feeds";
  if (body.feedId) {
    where.feedId = body.feedId;
    const feed = await prisma.feed.findUnique({
      where: { id: body.feedId },
      select: { title: true },
    });
    label = feed?.title ?? label;
  } else if (body.categoryId) {
    Object.assign(where, categoryFilter(body.categoryId));
    label = "this category";
  } else if (body.news) {
    Object.assign(where, newsFilter(body.news));
    label = "News";
  } else {
    const source = parseSource(body.source);
    if (source) {
      Object.assign(where, sourceFilter(source));
      label = source === "youtube" ? "YouTube" : source === "podcast" ? "Podcasts" : source;
    }
  }
  try {
    return NextResponse.json(await catchUp(where, label));
  } catch (error) {
    if (isQuotaError(error)) {
      return NextResponse.json({ error: "Today's AI budget is used up." }, { status: 429 });
    }
    if (error instanceof AiError && error.status === 503) {
      return NextResponse.json({ error: "AI is off or busy right now." }, { status: 503 });
    }
    console.error("POST /api/catchup failed", error);
    return NextResponse.json({ error: "Couldn't write the catch-up" }, { status: 500 });
  }
}
