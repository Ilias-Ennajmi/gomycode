import { NextResponse } from "next/server";
import { todayStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

/** Today's reading (minutes, articles) and the streak, for the goal ring. */
export async function GET() {
  try {
    return NextResponse.json(await todayStats());
  } catch (error) {
    console.error("GET /api/stats/today failed", error);
    return NextResponse.json({ minutes: 0, read: 0, streak: 0 });
  }
}
