import { NextRequest, NextResponse } from "next/server";
import { isQuotaError } from "@/lib/ai";
import { suggestTags } from "@/lib/smart";
import { reportProblem } from "@/lib/errlog";

export const maxDuration = 30;

/** Two or three tags Gemini would file this highlight under. */
export async function POST(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    return NextResponse.json({ tags: await suggestTags(params.id) });
  } catch (error) {
    if (isQuotaError(error)) return NextResponse.json({ tags: [], quota: true });
    await reportProblem("Tag suggestions", error);
    return NextResponse.json({ tags: [] });
  }
}
