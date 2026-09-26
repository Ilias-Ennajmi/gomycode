import { NextResponse } from "next/server";
import { checkCatalogBatch } from "@/lib/discover/health";

export const maxDuration = 30;

// Called in the background when Discover opens, so broken catalog entries
// disappear without waiting for the daily cron.
export async function POST() {
  try {
    return NextResponse.json(await checkCatalogBatch(8));
  } catch (error) {
    console.error("POST /api/discover/health failed", error);
    return NextResponse.json({ error: "Health check failed" }, { status: 500 });
  }
}
