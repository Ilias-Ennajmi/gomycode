import { NextRequest, NextResponse } from "next/server";
import { buildRecap } from "@/lib/recap";
import { reportProblem } from "@/lib/errlog";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** The recap: the last seven days of reading and news, or thirty with ?period=month. */
export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get("period") === "month" ? "month" : "week";
  try {
    return NextResponse.json({ recap: await buildRecap(period) });
  } catch (error) {
    await reportProblem("GET /api/recap", error);
    return NextResponse.json({ error: "Could not build the recap" }, { status: 500 });
  }
}
