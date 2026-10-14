import { NextRequest, NextResponse } from "next/server";
import { parseLangs } from "@/lib/discover/langs";
import { dedupe, followedKeys, markFollowing } from "@/lib/discover/search";
import { topApplePodcasts } from "@/lib/podcast";

export const maxDuration = 20;

/** Apple's top podcasts for each language picked in Discover (US chart, French chart). */
export async function GET(request: NextRequest) {
  const langs = parseLangs(request.nextUrl.searchParams.get("langs"));
  const charts = await Promise.allSettled(
    langs.map((lang) => topApplePodcasts(lang, langs.length > 1 ? 12 : 25))
  );
  const results = dedupe(charts.flatMap((c) => (c.status === "fulfilled" ? c.value : [])));
  if (results.length === 0 && charts.some((c) => c.status === "rejected")) {
    console.warn("Discover: Apple Podcasts charts unavailable");
  }
  return NextResponse.json(
    { results: markFollowing(results, await followedKeys()) },
    { headers: { "Cache-Control": "private, max-age=3600" } }
  );
}
