import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readSetting } from "@/lib/push";

export const dynamic = "force-dynamic";

// For uptime monitors: is the database reachable, and is the hourly refresh still running?
// Public (like the ticks) and says nothing about what's stored: two answers and two ages.
// 200 when healthy, 503 when the database is down or the refresh hasn't run in 3 hours.

const STALE_TICK_MS = 3 * 60 * 60 * 1000;

export async function GET() {
  let database = true;
  try {
    await prisma.$queryRaw`select 1`;
  } catch {
    database = false;
  }
  const lastTick = database ? await readSetting<{ at?: number }>("last-tick", {}) : {};
  const tickAge = lastTick.at ? Date.now() - lastTick.at : null;
  const refreshing = tickAge !== null && tickAge < STALE_TICK_MS;
  const ok = database && refreshing;
  return NextResponse.json(
    {
      ok,
      database,
      refreshing,
      lastRefreshMinutesAgo: tickAge === null ? null : Math.round(tickAge / 60_000),
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
