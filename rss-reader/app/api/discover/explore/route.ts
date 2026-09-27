import { NextRequest, NextResponse } from "next/server";
import { CATALOG_CATEGORIES, type CatalogCategoryId } from "@/lib/discover/catalog";
import { exploreCategory } from "@/lib/discover/explore";
import { parseKind, parseLangs } from "@/lib/discover/langs";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

// GET ?category=tech&kind=youtube&langs=en,fr&page=0 → live "More like this" results.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const category = params.get("category") as CatalogCategoryId | null;
  if (!category || !CATALOG_CATEGORIES.some((c) => c.id === category)) {
    return NextResponse.json({ error: "Unknown category" }, { status: 400 });
  }
  try {
    const page = Math.max(0, Math.min(40, Number(params.get("page")) || 0));
    return NextResponse.json(
      await exploreCategory(
        category,
        parseKind(params.get("kind")),
        parseLangs(params.get("langs")),
        page
      )
    );
  } catch (error) {
    console.error("GET /api/discover/explore failed", error);
    return NextResponse.json({ results: [], hasMore: false });
  }
}
