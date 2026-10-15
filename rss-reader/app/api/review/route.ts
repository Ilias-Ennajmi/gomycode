import { NextRequest, NextResponse } from "next/server";
import { moreToReview, todaysReview } from "@/lib/review";

export const dynamic = "force-dynamic";

/** Today's daily review; ?more=1 for the next due highlights once today's are done. */
export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("more") === "1") {
    return NextResponse.json({ highlights: await moreToReview() });
  }
  return NextResponse.json(await todaysReview());
}
