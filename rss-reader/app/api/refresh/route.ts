import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchAndParseFeed } from "@/lib/rss";
import { insertNewArticles, mapWithConcurrency } from "@/lib/ingest";
import { runAiPipeline } from "@/lib/enrich";

export const maxDuration = 60;

const MAX_ERROR_COUNT = 5;
const CONCURRENCY = 6;

// Auth is enforced by middleware.ts: either a valid session cookie (manual
// refresh from the app) or `Authorization: Bearer $CRON_SECRET` (Vercel cron).
async function handleRefresh(feedId?: string) {
  try {
    const feeds = feedId
      ? await prisma.feed.findMany({ where: { id: feedId, type: { not: "manual" } } })
      : await prisma.feed.findMany({ where: { type: { not: "manual" } } });

    if (feedId && feeds.length === 0) {
      return NextResponse.json({ error: "Feed not found" }, { status: 404 });
    }

    const errors: string[] = [];

    const results = await mapWithConcurrency(feeds, CONCURRENCY, async (feed) => {
      try {
        const parsed = await fetchAndParseFeed(feed.url);
        const created = await insertNewArticles(feed.id, parsed.articles);
        await prisma.feed.update({
          where: { id: feed.id },
          data: { lastFetched: new Date(), errorCount: 0 },
        });
        return created.length;
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
        return 0;
      }
    });

    const newArticles = results.reduce((sum, n) => sum + n, 0);
    await runAiPipeline();
    return NextResponse.json({ updated: feeds.length - errors.length, newArticles, errors });
  } catch (error) {
    console.error("/api/refresh failed", error);
    return NextResponse.json({ error: "Failed to refresh feeds" }, { status: 500 });
  }
}

// Triggered by the Vercel Cron Job, which sends a GET request.
export async function GET() {
  return handleRefresh();
}

// Triggered by the in-app manual refresh button.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { feedId } = body as { feedId?: string };
  return handleRefresh(feedId);
}
