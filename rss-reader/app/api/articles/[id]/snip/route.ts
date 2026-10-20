import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateText, isAiEnabled } from "@/lib/ai";
import { HIGHLIGHT_ARTICLE_INCLUDE } from "@/lib/highlights";
import type { TimedText } from "@/lib/types";

export const dynamic = "force-dynamic";

const WINDOWS = [30, 60] as const;
const MAX_TEXT = 1600;

function clock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** The transcript said in [from, to]: the paragraphs that start inside, else the one before. */
function excerpt(transcript: TimedText[], from: number, to: number) {
  const inside = transcript.filter((line) => line.t >= from - 3 && line.t <= to);
  if (inside.length > 0) return inside.map((line) => line.text).join(" ");
  const before = transcript.filter((line) => line.t <= to).slice(-1);
  return before.map((line) => line.text).join(" ");
}

/** The first sentence, cut at a word boundary when it runs long. */
function shortTitle(text: string) {
  const sentence = text.split(/(?<=[.!?])\s/)[0].replace(/[.!?]+$/, "");
  if (sentence.length <= 64) return sentence;
  const cut = sentence.slice(0, 64);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)).replace(/[,;:\s]+$/, "")}…`;
}

async function titleAndNote(text: string, episode: string, show: string) {
  if (!isAiEnabled()) return null;
  try {
    const raw = await generateText(
      `A listener snipped this moment of the podcast episode "${episode}" (${show}):\n\n"""${text}"""\n\n` +
        'Reply with JSON {"title": "...", "summary": "..."}: a title of at most 8 words that says ' +
        "what the moment is about (no quotes, no trailing period), and a one-sentence summary of " +
        "the point made, in the language of the transcript.",
      { json: true, maxTokens: 160, priority: "user" }
    );
    const data = JSON.parse(raw) as { title?: unknown; summary?: unknown };
    const title = typeof data.title === "string" ? data.title.trim().slice(0, 120) : "";
    const summary = typeof data.summary === "string" ? data.summary.trim().slice(0, 600) : "";
    return title ? { title, summary } : null;
  } catch {
    return null;
  }
}

/**
 * POST { at: seconds, window: 30 | 60 }: saves the last half-minute (or minute) of the
 * episode as a snip: its transcript, a title and a one-line summary, and where to replay it.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = (await request.json().catch(() => ({}))) as { at?: unknown; window?: unknown };
  const at = Math.max(0, Math.floor(Number(body.at) || 0));
  const window = WINDOWS.includes(body.window as (typeof WINDOWS)[number])
    ? (body.window as number)
    : 30;
  const article = await prisma.article.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      title: true,
      audioUrl: true,
      transcript: true,
      feed: { select: { title: true } },
    },
  });
  if (!article) return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  if (!article.audioUrl) {
    return NextResponse.json({ error: "Only episodes can be snipped" }, { status: 400 });
  }

  const from = Math.max(0, at - window);
  const transcript = Array.isArray(article.transcript)
    ? (article.transcript as unknown as TimedText[])
    : [];
  const spoken = excerpt(transcript, from, at).trim().slice(0, MAX_TEXT);
  const hasTranscript = spoken.length > 0;
  const ai = hasTranscript ? await titleAndNote(spoken, article.title, article.feed.title) : null;
  const fallbackTitle = hasTranscript ? shortTitle(spoken) : `Moment at ${clock(at)}`;

  const highlight = await prisma.highlight.create({
    data: {
      articleId: article.id,
      kind: "snip",
      text: hasTranscript ? spoken : `${article.title} · ${clock(from)}–${clock(at)}`,
      title: ai?.title ?? fallbackTitle,
      note: ai?.summary || null,
      color: "blue",
      tags: ["snip"],
      startSeconds: from,
      endSeconds: at,
    },
    include: HIGHLIGHT_ARTICLE_INCLUDE,
  });
  return NextResponse.json({ highlight, transcript: hasTranscript }, { status: 201 });
}
