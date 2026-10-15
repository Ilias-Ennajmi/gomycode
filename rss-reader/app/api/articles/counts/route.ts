import { NextResponse } from "next/server";
import { allCounts } from "@/lib/counts";

export const dynamic = "force-dynamic";

/** All the tab and sidebar numbers in one request. */
export async function GET() {
  try {
    return NextResponse.json(await allCounts());
  } catch (error) {
    console.error("GET /api/articles/counts failed", error);
    return NextResponse.json({ error: "Failed to load counts" }, { status: 500 });
  }
}
