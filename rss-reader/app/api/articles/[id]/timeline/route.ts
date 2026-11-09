import { NextRequest, NextResponse } from "next/server";
import { storyTimeline } from "@/lib/smart";

export const dynamic = "force-dynamic";

/** The story behind an article, day by day. */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return NextResponse.json({ days: await storyTimeline(params.id) });
}
