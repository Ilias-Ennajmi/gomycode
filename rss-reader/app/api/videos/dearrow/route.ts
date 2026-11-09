import { NextResponse } from "next/server";
import { deArrowOn, setDeArrow } from "@/lib/dearrow";
import { reportProblem } from "@/lib/errlog";
import { BadRequest, badRequest, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Plain YouTube titles from DeArrow: on or off (switching puts the other titles back). */
export async function GET() {
  return NextResponse.json({ on: await deArrowOn() });
}

export async function PUT(request: Request) {
  try {
    const { on } = await readJson<{ on?: unknown }>(request);
    if (typeof on !== "boolean") {
      return NextResponse.json({ error: "on must be true or false" }, { status: 400 });
    }
    await setDeArrow(on);
    return NextResponse.json({ on });
  } catch (error) {
    if (error instanceof BadRequest) return badRequest(error);
    await reportProblem("PUT /api/videos/dearrow", error);
    return NextResponse.json({ error: "Couldn't change titles" }, { status: 500 });
  }
}
