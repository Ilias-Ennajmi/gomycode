import { NextRequest, NextResponse } from "next/server";
import { CATALOG, CATALOG_CATEGORIES } from "@/lib/discover/catalog";
import { hiddenCatalogIds } from "@/lib/discover/health";
import { parseLangs } from "@/lib/discover/langs";
import { catalogResult, followedKeys, markFollowing } from "@/lib/discover/search";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const langs = parseLangs(request.nextUrl.searchParams.get("langs"));
    const [hidden, followed] = await Promise.all([hiddenCatalogIds(), followedKeys()]);
    const entries = CATALOG.filter((e) => !hidden.has(e.id) && langs.includes(e.lang));
    const results = markFollowing(
      entries.map((e) => ({ ...catalogResult(e), id: e.id, categoryId: e.category })),
      followed
    );
    return NextResponse.json({ categories: CATALOG_CATEGORIES, entries: results });
  } catch (error) {
    console.error("GET /api/discover/catalog failed", error);
    return NextResponse.json({ error: "Could not load suggestions" }, { status: 500 });
  }
}
