import { NextRequest, NextResponse } from "next/server";
import { getOrCreateBriefing, moreStories, refreshBriefing } from "@/lib/digest";
import { isAiEnabled } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const briefing = await getOrCreateBriefing();
    return NextResponse.json({ enabled: isAiEnabled(), briefing });
  } catch (error) {
    console.error("Daily briefing failed", error);
    return NextResponse.json({ enabled: isAiEnabled(), briefing: null });
  }
}

// POST { action: "refresh" } rewrites today's briefing (at most every 3 hours).
// POST { action: "more", mode: "next" | "shuffle", exclude: articleIds } writes more stories.
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { action?: string; mode?: string; exclude?: unknown };
    if (body.action === "refresh") {
      return NextResponse.json(await refreshBriefing());
    }
    if (body.action === "more") {
      const exclude = Array.isArray(body.exclude)
        ? body.exclude.filter((id): id is string => typeof id === "string").slice(0, 200)
        : [];
      const stories = await moreStories(exclude, body.mode === "shuffle" ? "shuffle" : "next");
      return NextResponse.json({ stories });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/digest failed", error);
    return NextResponse.json({ error: "Could not update the briefing" }, { status: 500 });
  }
}
