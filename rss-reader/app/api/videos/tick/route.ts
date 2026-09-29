import { NextResponse } from "next/server";
import { readSetting, writeSetting } from "@/lib/push";
import { runVideoAiBatch } from "@/lib/video-ai";

// Gemini reads a video in 20-60 seconds, so this runs on its own schedule (Supabase pg_cron,
// hourly at :47), separate from the feed refresh.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const LAST_KEY = "video-tick";
// Public like /api/refresh/tick: it can't do more than this, whoever calls it.
const MIN_INTERVAL_MS = 20 * 60 * 1000;
const BUDGET_MS = 270_000;

/** Summaries, key moments and transcripts for new videos, a few per run. */
export async function GET() {
  const started = Date.now();
  const last = await readSetting<{ at: number }>(LAST_KEY, { at: 0 });
  if (started - last.at < MIN_INTERVAL_MS) return NextResponse.json({ skipped: true });
  await writeSetting(LAST_KEY, { at: started });

  const results = await runVideoAiBatch(started + BUDGET_MS).catch((error) => {
    console.error("Video tick failed", error);
    return [];
  });
  // Counts only.
  return NextResponse.json({
    done: results.filter((r) => r === "done").length,
    busy: results.filter((r) => r === "busy").length,
    failed: results.filter((r) => r === "failed").length,
  });
}
