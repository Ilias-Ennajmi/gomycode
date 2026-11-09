import { NextResponse } from "next/server";
import { unusedSourceIds } from "@/lib/unused-sources";
import { reportProblem } from "@/lib/errlog";

export const dynamic = "force-dynamic";

/** Sources nothing was read from in two months: ids, for the sources manager and Today. */
export async function GET() {
  try {
    return NextResponse.json({ ids: await unusedSourceIds() });
  } catch (error) {
    await reportProblem("GET /api/feeds/unused", error);
    return NextResponse.json({ ids: [] });
  }
}
