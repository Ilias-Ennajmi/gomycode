import { NextResponse } from "next/server";
import { readingStats } from "@/lib/stats";
import { reportProblem } from "@/lib/errlog";

export const dynamic = "force-dynamic";

/** The reading stats page's numbers. */
export async function GET() {
  try {
    return NextResponse.json(await readingStats());
  } catch (error) {
    await reportProblem("GET /api/stats", error);
    return NextResponse.json({ error: "Couldn't count your reading" }, { status: 500 });
  }
}
