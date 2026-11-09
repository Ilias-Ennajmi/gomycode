import { NextRequest, NextResponse } from "next/server";
import { refreshFeeds } from "@/lib/refresh";
import { runMaintenance } from "@/lib/maintenance";
import { checkCatalogBatch } from "@/lib/discover/health";
import { sendScheduledPushes, wakeSnoozedArticles } from "@/lib/push";
import { reportProblem } from "@/lib/errlog";

export const maxDuration = 60;

// Auth is enforced by middleware.ts: either a valid session cookie (manual
// refresh from the app) or `Authorization: Bearer $CRON_SECRET` (Vercel cron).
async function handleRefresh(feedId?: string) {
  try {
    const result = await refreshFeeds(feedId);
    if (!result) return NextResponse.json({ error: "Feed not found" }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    await reportProblem("/api/refresh", error);
    return NextResponse.json({ error: "Failed to refresh feeds" }, { status: 500 });
  }
}

// Triggered by the Vercel Cron Job, which sends a GET request.
export async function GET() {
  const started = Date.now();
  const response = await handleRefresh();
  await wakeSnoozedArticles().catch((error) => reportProblem("Waking snoozes", error));
  // The cron runs in the morning: that's when the briefing notification goes out.
  await sendScheduledPushes({ morning: true }).catch((error) =>
    reportProblem("Push notifications", error)
  );
  // The daily cron also re-checks part of the Discover catalog.
  await checkCatalogBatch().catch((error) => reportProblem("Catalog health check", error));
  await runMaintenance(started + 45_000);
  return response;
}

// Triggered by the in-app manual refresh button.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { feedId } = body as { feedId?: string };
  const response = await handleRefresh(feedId);
  if (!feedId) {
    await wakeSnoozedArticles().catch((error) => reportProblem("Waking snoozes", error));
    await sendScheduledPushes({ morning: false }).catch((error) =>
      reportProblem("Push notifications", error)
    );
  }
  return response;
}
