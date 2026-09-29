import { NextResponse } from "next/server";
import { buildRecap } from "@/lib/recap";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** The weekly recap: the last seven days of reading and news. */
export async function GET() {
  try {
    return NextResponse.json({ recap: await buildRecap() });
  } catch (error) {
    console.error("GET /api/recap failed", error);
    return NextResponse.json({ error: "Could not build the recap" }, { status: 500 });
  }
}
