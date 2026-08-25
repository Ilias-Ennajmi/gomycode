import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchAndParseFeed } from "@/lib/rss";

const MAX_ERROR_COUNT = 5;

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    return authHeader === `Bearer ${process.env.CRON_SECRET}`;
  }
  // Manual refresh triggered from within the app.
  return request.headers.get("x-internal-request") === "true";
}

async function refreshFeed(feed: { id: string; url: string; title: string }) {
  const parsed = await fetchAndParseFeed(feed.url);

  for (const article of parsed.articles) {
    await prisma.article.upsert({
      where: { feedId_link: { feedId: feed.id, link: article.link } },
      update: {
        title: article.title,
        summary: article.summary,
        content: article.content,
        imageUrl: article.imageUrl,
        author: article.author,
        publishedAt: article.publishedAt,
      },
      create: {
        feedId: feed.id,
        title: article.title,
        link: article.link,
        summary: article.summary,
        content: article.content,
        imageUrl: article.imageUrl,
        author: article.author,
        publishedAt: article.publishedAt,
      },
    });
  }

  await prisma.feed.update({
    where: { id: feed.id },
    data: { lastFetched: new Date(), errorCount: 0 },
  });

  return parsed.articles.length;
}

async function handleRefresh(request: NextRequest, feedId?: string) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const feeds = feedId
      ? await prisma.feed.findMany({ where: { id: feedId } })
      : await prisma.feed.findMany();

    if (feedId && feeds.length === 0) {
      return NextResponse.json({ error: "Feed not found" }, { status: 404 });
    }

    let updated = 0;
    const errors: string[] = [];

    for (const feed of feeds) {
      try {
        await refreshFeed(feed);
        updated += 1;
      } catch (error) {
        console.error(`Failed to refresh feed ${feed.title}`, error);
        errors.push(`${feed.title}: could not fetch feed`);
        await prisma.feed.update({
          where: { id: feed.id },
          data: {
            errorCount: Math.min(feed.errorCount + 1, MAX_ERROR_COUNT + 1),
            lastFetched: new Date(),
          },
        });
      }
    }

    return NextResponse.json({ updated, errors });
  } catch (error) {
    console.error("/api/refresh failed", error);
    return NextResponse.json({ error: "Failed to refresh feeds" }, { status: 500 });
  }
}

// Triggered by the Vercel Cron Job, which sends a GET request.
export async function GET(request: NextRequest) {
  return handleRefresh(request);
}

// Triggered by the in-app manual refresh button.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { feedId } = body as { feedId?: string };
  return handleRefresh(request, feedId);
}
