import { NextRequest, NextResponse } from "next/server";
import { AiError, isQuotaError } from "@/lib/ai";
import { LANGUAGE_NAMES, translateArticle } from "@/lib/smart";

export const maxDuration = 120;

/** The article in another language (?to=en|fr|…), made once and kept. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const to = request.nextUrl.searchParams.get("to") ?? "en";
  if (!LANGUAGE_NAMES[to]) return NextResponse.json({ error: "Unknown language" }, { status: 400 });
  try {
    return NextResponse.json(await translateArticle(params.id, to));
  } catch (error) {
    if (isQuotaError(error)) {
      return NextResponse.json({ error: "Today's AI budget is used up." }, { status: 429 });
    }
    if (error instanceof AiError && error.status === 503) {
      return NextResponse.json({ error: "AI is off or busy right now." }, { status: 503 });
    }
    console.error("Translate failed", error);
    return NextResponse.json({ error: "Couldn't translate this article" }, { status: 500 });
  }
}
