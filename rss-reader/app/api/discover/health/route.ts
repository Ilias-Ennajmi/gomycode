import { NextResponse } from "next/server";
import { checkCatalogBatch } from "@/lib/discover/health";
import { reportProblem } from "@/lib/errlog";

export const maxDuration = 30;

// Called in the background when Discover opens, so broken catalog entries
// disappear without waiting for the daily cron.
export async function POST() {
  try {
    return NextResponse.json(await checkCatalogBatch(8));
  } catch (error) {
    await reportProblem("POST /api/discover/health", error);
    return NextResponse.json({ error: "Health check failed" }, { status: 500 });
  }
}
