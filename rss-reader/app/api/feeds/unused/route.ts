import { NextResponse } from "next/server";
import { unusedSourceIds } from "@/lib/unused-sources";

export const dynamic = "force-dynamic";

/** Sources nothing was read from in two months: ids, for the sources manager and Today. */
export async function GET() {
  try {
    return NextResponse.json({ ids: await unusedSourceIds() });
  } catch (error) {
    console.error("GET /api/feeds/unused failed", error);
    return NextResponse.json({ ids: [] });
  }
}
