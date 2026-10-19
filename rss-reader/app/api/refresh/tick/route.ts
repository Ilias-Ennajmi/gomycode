import { NextResponse } from "next/server";
import { refreshFeeds } from "@/lib/refresh";
import { runMaintenance } from "@/lib/maintenance";
import { readSetting, sendScheduledPushes, wakeSnoozedArticles, writeSetting } from "@/lib/push";
import { recordError } from "@/lib/errlog";

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

  const result = await refreshFeeds().catch(async (error) => {
    console.error("Hourly refresh failed", error);
    await recordError("tick:refresh", error);
    return null;
  });
  const woke = await wakeSnoozedArticles().catch(async (error) => {
    console.error("Waking snoozes failed", error);
    await recordError("tick:snooze", error);
    return 0;
  });
  await sendScheduledPushes({ morning: false }).catch(async (error) => {
    console.error("Push notifications failed", error);
    await recordError("tick:push", error);
  });
  const maintenance = await runMaintenance(started + MAINTENANCE_BUDGET_MS).catch(async (error) => {
    await recordError("tick:maintenance", error);
    return {};
  });
  const summary = {
    updated: result?.updated ?? 0,
    newArticles: result?.newArticles ?? 0,
    skipped: result?.skipped ?? 0,
    failed: result?.errors.length ?? 0,
    woke,
    ...maintenance,
  };
  // What the last run did, for the System page.
  await writeSetting("last-tick", { at: Date.now(), ms: Date.now() - started, ...summary });
  // Public endpoint: counts only, not which feeds failed.
  return NextResponse.json(summary);
}
