import { NextRequest, NextResponse } from "next/server";
import { parseKind, parseLangs } from "@/lib/discover/langs";
import { searchSources } from "@/lib/discover/search";
import { reportProblem } from "@/lib/errlog";

export const maxDuration = 20;

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ results: [], unavailable: [] });
  try {
    const langs = parseLangs(request.nextUrl.searchParams.get("langs"));
    const kind = parseKind(request.nextUrl.searchParams.get("kind"));
    return NextResponse.json(await searchSources(query.slice(0, 200), langs, kind));
  } catch (error) {
    await reportProblem("GET /api/discover/search", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
