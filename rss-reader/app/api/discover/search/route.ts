import { NextRequest, NextResponse } from "next/server";
import { parseLangs } from "@/lib/discover/langs";
import { searchSources } from "@/lib/discover/search";

export const maxDuration = 20;

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ results: [], unavailable: [] });
  try {
    const langs = parseLangs(request.nextUrl.searchParams.get("langs"));
    return NextResponse.json(await searchSources(query.slice(0, 200), langs));
  } catch (error) {
    console.error("GET /api/discover/search failed", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
