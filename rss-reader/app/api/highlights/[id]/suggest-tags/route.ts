import { NextRequest, NextResponse } from "next/server";
import { isQuotaError } from "@/lib/ai";
import { suggestTags } from "@/lib/smart";

export const maxDuration = 30;

/** Two or three tags Gemini would file this highlight under. */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    return NextResponse.json({ tags: await suggestTags(params.id) });
  } catch (error) {
    if (isQuotaError(error)) return NextResponse.json({ tags: [], quota: true });
    console.error("Tag suggestions failed", error);
    return NextResponse.json({ tags: [] });
  }
}
