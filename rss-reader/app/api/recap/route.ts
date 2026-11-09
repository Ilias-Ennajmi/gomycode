import { NextResponse } from "next/server";
import { buildRecap } from "@/lib/recap";
import { reportProblem } from "@/lib/errlog";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** The weekly recap: the last seven days of reading and news. */
export async function GET() {
  try {
    return NextResponse.json({ recap: await buildRecap() });
  } catch (error) {
    await reportProblem("GET /api/recap", error);
    return NextResponse.json({ error: "Could not build the recap" }, { status: 500 });
  }
}
