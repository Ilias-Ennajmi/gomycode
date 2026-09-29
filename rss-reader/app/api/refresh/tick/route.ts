import { NextResponse } from "next/server";
import { refreshFeeds } from "@/lib/refresh";
import { runMaintenance } from "@/lib/maintenance";
import { readSetting, sendScheduledPushes, wakeSnoozedArticles, writeSetting } from "@/lib/push";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const LAST_KEY = "auto-refresh";
// Called hourly by a scheduler (Supabase pg_cron, see AGENTS.md). It needs no secret because
// it can't do more than refresh the feeds at most this often, whoever calls it.
const MIN_INTERVAL_MS = 40 * 60 * 1000;
// Picture lookups stop starting after this, to finish within maxDuration.
const MAINTENANCE_BUDGET_MS = 45_000;

/**
 * The hourly refresh: new articles, breaking-news alerts, snoozed articles coming back,
 * and the Sunday recap notification.
 */
export async function GET() {
  const started = Date.now();
  const last = await readSetting<{ at: number }>(LAST_KEY, { at: 0 });
  if (Date.now() - last.at < MIN_INTERVAL_MS) return NextResponse.json({ skipped: true });
  await writeSetting(LAST_KEY, { at: Date.now() });

  const result = await refreshFeeds().catch((error) => {
    console.error("Hourly refresh failed", error);
    return null;
  });
  const woke = await wakeSnoozedArticles().catch((error) => {
    console.error("Waking snoozes failed", error);
    return 0;
  });
  await sendScheduledPushes({ morning: false }).catch((error) =>
    console.error("Push notifications failed", error)
  );
  const maintenance = await runMaintenance(started + MAINTENANCE_BUDGET_MS);
  // Public endpoint: counts only, not which feeds failed.
  return NextResponse.json({
    updated: result?.updated ?? 0,
    newArticles: result?.newArticles ?? 0,
    failed: result?.errors.length ?? 0,
    woke,
    ...maintenance,
  });
}
