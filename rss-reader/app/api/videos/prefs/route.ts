import { NextRequest, NextResponse } from "next/server";
import { getVideoPrefs, updateVideoPrefs } from "@/lib/video-prefs";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ prefs: await getVideoPrefs() });
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { hideShorts?: unknown };
  if (typeof body.hideShorts !== "boolean") {
    return NextResponse.json({ error: "hideShorts must be true or false" }, { status: 400 });
  }
  return NextResponse.json({ prefs: await updateVideoPrefs({ hideShorts: body.hideShorts }) });
}
