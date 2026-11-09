import { NextResponse } from "next/server";
import { AiError, isAiEnabled, narrate, NARRATE_MAX_CHARS } from "@/lib/ai";
import { reportProblem } from "@/lib/errlog";
import { BadRequest, badRequest, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One passage of an article read aloud in a natural voice (Listen → Natural voice): the
 * client sends about a minute of text at a time and keeps the audio, so replays are free.
 */
export async function POST(request: Request) {
  if (!isAiEnabled()) return NextResponse.json({ error: "AI is off" }, { status: 503 });
  try {
    const { text, lang } = await readJson<{ text?: unknown; lang?: unknown }>(request);
    if (typeof text !== "string" || !text.trim() || text.length > NARRATE_MAX_CHARS) {
      return NextResponse.json(
        { error: `text must be 1 to ${NARRATE_MAX_CHARS} characters` },
        { status: 400 }
      );
    }
    const wav = await narrate(text, lang === "fr" ? "fr" : "en");
    return new Response(wav, {
      headers: { "Content-Type": "audio/wav", "Content-Length": String(wav.length) },
    });
  } catch (error) {
    if (error instanceof BadRequest) return badRequest(error);
    const status = error instanceof AiError ? (error.status ?? 500) : 500;
    // Busy or out of quota: the client carries on with the device's voice.
    if (status === 429 || status === 503) {
      return NextResponse.json({ error: "busy" }, { status });
    }
    await reportProblem("POST /api/narrate", error);
    return NextResponse.json({ error: "Couldn't read this aloud" }, { status: 500 });
  }
}
