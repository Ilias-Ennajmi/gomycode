import { NextRequest, NextResponse } from "next/server";
import { AiError, isQuotaError } from "@/lib/ai";
import { helpWithSelection, type SelectionAction } from "@/lib/smart";

export const maxDuration = 30;

const ACTIONS: SelectionAction[] = ["explain", "define", "translate"];

/** Explain, define or translate a passage the reader selected. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    text?: string;
    action?: string;
    title?: string;
    to?: string;
  };
  if (!body.text?.trim() || !ACTIONS.includes(body.action as SelectionAction)) {
    return NextResponse.json({ error: "Select some text first" }, { status: 400 });
  }
  try {
    const result = await helpWithSelection(body.text, body.action as SelectionAction, {
      title: body.title,
      to: body.to,
    });
    return NextResponse.json({ result });
  } catch (error) {
    if (isQuotaError(error)) {
      return NextResponse.json({ error: "Today's AI budget is used up." }, { status: 429 });
    }
    if (error instanceof AiError && error.status === 503) {
      return NextResponse.json({ error: "AI is off or busy right now." }, { status: 503 });
    }
    console.error("POST /api/ai/selection failed", error);
    return NextResponse.json({ error: "AI couldn't help with that right now" }, { status: 500 });
  }
}
