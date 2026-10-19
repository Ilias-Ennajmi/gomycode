import { NextRequest, NextResponse } from "next/server";
import { AiError, isQuotaError } from "@/lib/ai";
import { askReader, suggestedQuestions, type AskTurn } from "@/lib/smart";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Questions worth asking today. */
export async function GET() {
  return NextResponse.json({ suggestions: await suggestedQuestions() });
}

/** A question over your own feeds, answered with sources. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    question?: string;
    history?: AskTurn[];
  };
  const question = body.question?.trim().slice(0, 500);
  if (!question) return NextResponse.json({ error: "Ask something" }, { status: 400 });
  try {
    const history = Array.isArray(body.history) ? body.history.slice(-4) : [];
    return NextResponse.json(await askReader(question, history));
  } catch (error) {
    if (isQuotaError(error)) {
      return NextResponse.json(
        { error: "Today's AI budget is used up. Try again tomorrow." },
        { status: 429 }
      );
    }
    console.error("POST /api/ask failed", error);
    const status = error instanceof AiError && error.status === 503 ? 503 : 500;
    return NextResponse.json(
      { error: status === 503 ? "AI is off or busy right now" : "Couldn't answer that" },
      { status }
    );
  }
}
