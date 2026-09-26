import { NextRequest, NextResponse } from "next/server";
import { AiError, isAiEnabled } from "@/lib/ai";
import { parseLangs } from "@/lib/discover/langs";
import { suggestForFeed, suggestForYou, suggestFromDescription } from "@/lib/discover/suggest";

export const maxDuration = 60;

// GET ?feedId=… → "because you follow"; GET without it → suggestions for you.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const langs = parseLangs(params.get("langs"));
  const feedId = params.get("feedId");
  try {
    const results = feedId ? await suggestForFeed(feedId, langs) : await suggestForYou(langs);
    return NextResponse.json({ results });
  } catch (error) {
    console.error("GET /api/discover/suggest failed", error);
    return NextResponse.json({ results: [] });
  }
}

// POST { description, langs } → "describe what you like".
export async function POST(request: NextRequest) {
  if (!isAiEnabled()) {
    return NextResponse.json({ error: "AI suggestions need a Gemini key" }, { status: 503 });
  }
  try {
    const { description, langs } = (await request.json()) as {
      description?: string;
      langs?: string;
    };
    if (!description?.trim()) {
      return NextResponse.json({ error: "Describe what you like first" }, { status: 400 });
    }
    const results = await suggestFromDescription(description.trim(), parseLangs(langs));
    return NextResponse.json({ results });
  } catch (error) {
    console.error("POST /api/discover/suggest failed", error);
    const message =
      error instanceof AiError && error.status === 429
        ? "The free AI quota is used up for now. Try again in a minute."
        : "Could not get suggestions right now";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
