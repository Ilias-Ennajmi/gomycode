import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AiError, generateFromVideo, isAiEnabled } from "@/lib/ai";
import { formatClock, parseClock } from "@/lib/youtube-video";
import { youTubeVideoId } from "@/lib/youtube";

// What a video says, from Gemini: a summary, the moments worth jumping to, and a transcript
// (searchable, highlightable, each part a link to that moment). Gemini's free tier is often
// overloaded, so runs happen in the background with a few retries (runVideoAi), and on
// demand when a video is opened without them.

export interface TimedText {
  t: number;
  text: string;
}

export const MAX_ATTEMPTS = 4;
// Past this, only the summary and key moments: a full transcript takes too long to write.
const TRANSCRIPT_MAX_SECONDS = 45 * 60;
// Long videos are too many tokens for the free tier's per-minute limit.
const MAX_SECONDS = 2 * 60 * 60;

function clockOf(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (typeof value !== "string") return null;
  return parseClock(value.replace(/^\[|\]$/g, ""));
}

/**
 * Gemini's timestamps can drift past the end on long answers. Anything past the video's
 * length means the whole scale is off, so it is stretched back to fit.
 */
function timed(items: unknown, duration: number | null): TimedText[] {
  if (!Array.isArray(items)) return [];
  const parsed = items
    .map((item) => {
      const record = item as { t?: unknown; text?: unknown };
      const t = clockOf(record.t);
      const text = typeof record.text === "string" ? record.text.trim() : "";
      return t === null || !text ? null : { t, text };
    })
    .filter((item): item is TimedText => item !== null)
    .sort((a, b) => a.t - b.t);
  const last = parsed.at(-1)?.t ?? 0;
  if (duration && last > duration) {
    const scale = (duration - 5) / last;
    return parsed.map((item) => ({ ...item, t: Math.round(item.t * scale) }));
  }
  return parsed;
}

// Gemini often answers sentence by sentence; paragraphs of about half a minute read better
// and keep the time links useful.
const PARAGRAPH_SECONDS = 25;
const PARAGRAPH_MAX_CHARS = 600;

function paragraphs(parts: TimedText[]): TimedText[] {
  const merged: TimedText[] = [];
  for (const part of parts) {
    const current = merged.at(-1);
    if (
      current &&
      part.t - current.t < PARAGRAPH_SECONDS &&
      current.text.length + part.text.length < PARAGRAPH_MAX_CHARS
    ) {
      current.text = `${current.text} ${part.text}`;
    } else {
      merged.push({ ...part });
    }
  }
  return merged;
}

export interface VideoAnalysis {
  summary: string;
  keyMoments: TimedText[];
  transcript: TimedText[];
}

export async function analyzeVideo(
  videoId: string,
  durationSeconds: number | null,
  timeoutMs: number
): Promise<VideoAnalysis> {
  const withTranscript = !durationSeconds || durationSeconds <= TRANSCRIPT_MAX_SECONDS;
  const length = durationSeconds ? ` The video is ${formatClock(durationSeconds)} long.` : "";
  const prompt =
    `Watch this video and answer with JSON only.${length} Timestamps are "M:SS" (or "H:MM:SS") ` +
    "from the start of the video. Write in the video's own language.\n" +
    '{"summary": "3-4 plain sentences: what the video covers and its main takeaway", ' +
    '"keyMoments": [{"t": "M:SS", "text": "under 12 words"}] (5-8, in order, where each part starts)' +
    (withTranscript
      ? ', "transcript": [{"t": "M:SS", "text": "what is said, word for word"}] (everything ' +
        "spoken, in order, in chunks of about 30 seconds)"
      : "") +
    "}";

  const raw = await generateFromVideo(`https://www.youtube.com/watch?v=${videoId}`, prompt, {
    timeoutMs,
    maxTokens: withTranscript ? 32_000 : 2_000,
  });
  let data: { summary?: unknown; keyMoments?: unknown; transcript?: unknown };
  try {
    data = JSON.parse(raw);
  } catch {
    // Now and then the JSON comes wrapped in a code fence or a sentence: keep the object.
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    try {
      data = JSON.parse(raw.slice(start, end + 1));
    } catch {
      throw new AiError("Gemini returned something that isn't JSON");
    }
  }
  const summary = typeof data.summary === "string" ? data.summary.trim() : "";
  if (!summary) throw new AiError("Gemini returned no summary");
  return {
    summary,
    keyMoments: timed(data.keyMoments, durationSeconds).slice(0, 10),
    transcript: withTranscript ? paragraphs(timed(data.transcript, durationSeconds)) : [],
  };
}

/** Videos worth a Gemini run: not Shorts, not upcoming, not too long, not given up on. */
export const VIDEO_AI_CANDIDATE: Prisma.ArticleWhereInput = {
  isVideo: true,
  isShort: false,
  liveStatus: null,
  transcript: { equals: Prisma.DbNull },
  videoAiAttempts: { lt: MAX_ATTEMPTS },
  OR: [{ durationSeconds: null }, { durationSeconds: { lte: MAX_SECONDS } }],
};

export type VideoAiResult = "done" | "busy" | "failed" | "skipped";

/** Runs Gemini on one video and stores the result. "busy" means try again later. */
export async function runVideoAi(articleId: string, timeoutMs: number): Promise<VideoAiResult> {
  if (!isAiEnabled()) return "skipped";
  const article = await prisma.article.findFirst({
    where: { id: articleId, ...VIDEO_AI_CANDIDATE },
    select: { id: true, link: true, durationSeconds: true, aiSummary: true },
  });
  const videoId = article && youTubeVideoId(article.link);
  if (!article || !videoId) return "skipped";

  // Counted first, so a run that times out still counts.
  await prisma.article.update({
    where: { id: article.id },
    data: { videoAiAt: new Date(), videoAiAttempts: { increment: 1 } },
  });
  try {
    const analysis = await analyzeVideo(videoId, article.durationSeconds, timeoutMs);
    await prisma.article.update({
      where: { id: article.id },
      data: {
        aiSummary: analysis.summary,
        keyMoments: analysis.keyMoments as unknown as Prisma.InputJsonValue,
        // An empty array marks "done, no transcript" (long videos), so it isn't retried.
        transcript: analysis.transcript as unknown as Prisma.InputJsonValue,
      },
    });
    return "done";
  } catch (error) {
    const status = error instanceof AiError ? error.status : undefined;
    const busy = status === 503 || status === 429 || (error as Error)?.name === "TimeoutError";
    console.error(`Video AI ${busy ? "postponed" : "failed"} for ${articleId}`, error);
    // Google being overloaded isn't the video's fault: it doesn't use up a try (the wait
    // before the next run still applies, and background runs only look back two weeks).
    if (busy) {
      await prisma.article.update({
        where: { id: article.id },
        data: { videoAiAttempts: { decrement: 1 } },
      });
    }
    return busy ? "busy" : "failed";
  }
}

/**
 * Background runs (the hourly video tick): newest videos first, each waiting a bit between
 * attempts. Stops starting new runs past the deadline.
 */
export async function runVideoAiBatch(deadline: number, limit = 3) {
  const retryAfter = new Date(Date.now() - 45 * 60 * 1000);
  const candidates = await prisma.article.findMany({
    where: {
      AND: [VIDEO_AI_CANDIDATE, { OR: [{ videoAiAt: null }, { videoAiAt: { lt: retryAfter } }] }],
      createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: { id: true },
  });
  const results: VideoAiResult[] = [];
  for (const { id } of candidates) {
    const left = deadline - Date.now();
    if (left < 30_000) break;
    const result = await runVideoAi(id, left - 5_000);
    results.push(result);
    // Overloaded: the next one would fail the same way.
    if (result === "busy") break;
  }
  return results;
}
