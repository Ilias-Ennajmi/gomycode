import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AiError, generateFromAudio, generateFromVideo, isAiEnabled } from "@/lib/ai";
import type { AiPriority } from "@/lib/ai-budget";
import { formatClock, parseClock } from "@/lib/youtube-video";
import { youTubeVideoId } from "@/lib/youtube";
import { reportProblem } from "@/lib/errlog";
import { salvageJsonInfo } from "@/lib/json-salvage";

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
// A transcript too long for one answer is continued in up to two more (analyzeVideo).
const TRANSCRIPT_MAX_SECONDS = 75 * 60;
// Long videos are too many tokens for the free tier's per-minute limit.
const MAX_SECONDS = 2 * 60 * 60;
// Audio is 32 tokens a second: about 2 h 15 fits the free tier's per-minute limit.
const AUDIO_MAX_SECONDS = 135 * 60;
// Episodes: a transcript up to 100 minutes (talk is dense; longer ones take too long).
const AUDIO_TRANSCRIPT_MAX_SECONDS = 100 * 60;
const MAX_CONTINUATIONS = 2;
// A continuation needs room to finish: not started with less than this left.
const CONTINUATION_MIN_MS = 100_000;

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

// Transcripts are kept sentence by sentence, each with its own start: read along follows
// the voice phrase by phrase and snips cut where the words are.

export interface VideoAnalysis {
  summary: string;
  keyMoments: TimedText[];
  transcript: TimedText[];
}

type Media =
  | { kind: "video"; videoId: string }
  | { kind: "audio"; url: string; type: string | null };

/** The lines after what's already there: a continuation may repeat the last line or two. */
export function mergeTranscripts(base: TimedText[], more: TimedText[]) {
  const last = base.at(-1)?.t ?? -1;
  const known = new Set(base.slice(-5).map((line) => line.text));
  return [
    ...base,
    ...more.filter((line) => line.t > last || (line.t === last && !known.has(line.text))),
  ];
}

function continuationPrompt(noun: string, last: TimedText) {
  return (
    `This ${noun}'s transcript is being written in parts. The part so far ends at ` +
    `${formatClock(last.t)} with: "${last.text}". Answer with JSON only, continuing right ` +
    `after that sentence, to the end of the ${noun} (or as far as you can): ` +
    '{"transcript": [{"t": "M:SS", "text": "what is said, word for word"}]} ' +
    "with one entry per sentence and the second it starts, in the same language."
  );
}

export async function analyzeVideo(
  media: Media,
  durationSeconds: number | null,
  timeoutMs: number,
  priority: AiPriority
): Promise<VideoAnalysis> {
  const audio = media.kind === "audio";
  const noun = audio ? "episode" : "video";
  const transcriptMax = audio ? AUDIO_TRANSCRIPT_MAX_SECONDS : TRANSCRIPT_MAX_SECONDS;
  const withTranscript = !durationSeconds || durationSeconds <= transcriptMax;
  const length = durationSeconds ? ` The ${noun} is ${formatClock(durationSeconds)} long.` : "";
  const prompt =
    `${audio ? "Listen to this podcast episode" : "Watch this video"} and answer with JSON only.` +
    `${length} Timestamps are "M:SS" (or "H:MM:SS") from the start of the ${noun}. ` +
    `Write in the ${noun}'s own language.\n` +
    `{"summary": "3-4 plain sentences: what the ${noun} covers and its main takeaway", ` +
    '"keyMoments": [{"t": "M:SS", "text": "under 12 words"}] (5-8, in order, where each part starts)' +
    (withTranscript
      ? ', "transcript": [{"t": "M:SS", "text": "what is said, word for word"}] (everything ' +
        "spoken, in order, one entry per sentence with the second it starts; split sentences " +
        "longer than about 15 words where the speaker pauses)"
      : "") +
    "}";

  const deadline = Date.now() + timeoutMs;
  const ask = (text: string) => {
    const options = {
      timeoutMs: Math.max(5_000, deadline - Date.now()),
      maxTokens: withTranscript ? 32_000 : 2_000,
      priority,
    };
    return media.kind === "audio"
      ? generateFromAudio({ url: media.url, type: media.type }, text, options)
      : generateFromVideo(`https://www.youtube.com/watch?v=${media.videoId}`, text, options);
  };
  type Answer = { summary?: unknown; keyMoments?: unknown; transcript?: unknown };
  const read = (raw: string) => {
    try {
      return { data: JSON.parse(raw) as Answer, complete: true };
    } catch {
      // Wrapped in a code fence or a sentence, or cut off at the length limit (a long
      // transcript): keep everything up to the last complete entry.
      try {
        const { value, complete } = salvageJsonInfo(raw);
        return { data: value as Answer, complete };
      } catch {
        throw new AiError("Gemini returned something that isn't JSON");
      }
    }
  };

  const first = read(await ask(prompt));
  const data = first.data;
  const summary = typeof data.summary === "string" ? data.summary.trim() : "";
  if (!summary) throw new AiError("Gemini returned no summary");
  let transcript = withTranscript ? timed(data.transcript, durationSeconds) : [];

  // Cut off before the end: ask for the rest, as long as there's time and it's getting
  // somewhere. What's already written is kept whatever happens next.
  let complete = first.complete;
  for (let n = 0; withTranscript && !complete && n < MAX_CONTINUATIONS; n++) {
    const last = transcript.at(-1);
    if (!last || (durationSeconds && last.t >= durationSeconds - 90)) break;
    if (deadline - Date.now() < CONTINUATION_MIN_MS) break;
    try {
      const next = read(await ask(continuationPrompt(noun, last)));
      const more = timed(next.data.transcript, durationSeconds);
      const merged = mergeTranscripts(transcript, more);
      if (merged.length === transcript.length) break;
      transcript = merged;
      complete = next.complete;
    } catch {
      break;
    }
  }
  return {
    summary,
    keyMoments: timed(data.keyMoments, durationSeconds).slice(0, 10),
    transcript,
  };
}

/**
 * Videos and podcast episodes worth a Gemini run: not Shorts, not upcoming, not too long,
 * not given up on.
 */
export const VIDEO_AI_CANDIDATE: Prisma.ArticleWhereInput = {
  transcript: { equals: Prisma.DbNull },
  videoAiAttempts: { lt: MAX_ATTEMPTS },
  OR: [
    {
      isVideo: true,
      isShort: false,
      liveStatus: null,
      OR: [{ durationSeconds: null }, { durationSeconds: { lte: MAX_SECONDS } }],
    },
    {
      isVideo: false,
      audioUrl: { not: null },
      OR: [{ durationSeconds: null }, { durationSeconds: { lte: AUDIO_MAX_SECONDS } }],
    },
  ],
};

export type VideoAiResult = "done" | "busy" | "failed" | "skipped";

// Transcripts made before this were ~25-second paragraphs; later ones go sentence by
// sentence. Played or saved episodes and videos with an old one are redone once.
const SENTENCE_TRANSCRIPTS_SINCE = new Date("2026-11-10T00:00:00Z");

const REFINE_CANDIDATE: Prisma.ArticleWhereInput = {
  NOT: { transcript: { equals: Prisma.DbNull } },
  OR: [{ videoAiAt: null }, { videoAiAt: { lt: SENTENCE_TRANSCRIPTS_SINCE } }],
  AND: [
    { OR: [{ isSaved: true }, { watchedSeconds: { gt: 0 } }, { readProgress: { gt: 0 } }] },
    { OR: [{ isVideo: true }, { audioUrl: { not: null } }] },
  ],
};

/** Paragraph-sized lines (a median of 12 s or more between starts): too coarse to follow. */
export function isCoarseTranscript(transcript: unknown) {
  if (!Array.isArray(transcript) || transcript.length < 3) return false;
  const gaps = transcript
    .slice(1)
    .map((line, i) => (line as TimedText).t - (transcript[i] as TimedText).t)
    .sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] >= 12;
}

/** Played or saved episodes and videos whose transcript is still the old, coarse kind. */
export async function refineQueue(limit: number) {
  const found = await prisma.article.findMany({
    where: REFINE_CANDIDATE,
    orderBy: [{ isSaved: "desc" }, { publishedAt: "desc" }],
    take: 30,
    select: { id: true, transcript: true },
  });
  return found
    .filter((a) => isCoarseTranscript(a.transcript))
    .slice(0, limit)
    .map((a) => a.id);
}

/**
 * Runs Gemini on one video and stores the result. "busy" means try again later. With
 * `refine`, redoes an old coarse transcript instead (once: it doesn't use up a try).
 */
export async function runVideoAi(
  articleId: string,
  timeoutMs: number,
  priority: AiPriority = "user",
  { refine = false } = {}
): Promise<VideoAiResult> {
  if (!isAiEnabled()) return "skipped";
  const article = await prisma.article.findFirst({
    where: { id: articleId, ...(refine ? REFINE_CANDIDATE : VIDEO_AI_CANDIDATE) },
    select: {
      id: true,
      videoAiAt: true,
      link: true,
      durationSeconds: true,
      aiSummary: true,
      isVideo: true,
      audioUrl: true,
      audioType: true,
    },
  });
  if (!article) return "skipped";
  const videoId = article.isVideo ? youTubeVideoId(article.link) : null;
  const media: Media | null = videoId
    ? { kind: "video", videoId }
    : article.audioUrl
      ? { kind: "audio", url: article.audioUrl, type: article.audioType }
      : null;
  if (!media) return "skipped";

  // Counted first, so a run that times out still counts.
  await prisma.article.update({
    where: { id: article.id },
    data: refine
      ? { videoAiAt: new Date() }
      : { videoAiAt: new Date(), videoAiAttempts: { increment: 1 } },
  });
  try {
    const analysis = await analyzeVideo(media, article.durationSeconds, timeoutMs, priority);
    // A redo that came back without a transcript keeps the old one.
    if (refine && analysis.transcript.length === 0) return "failed";
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
    if (busy) console.warn(`Video AI postponed for ${articleId}: ${(error as Error).message}`);
    else await reportProblem(`Video AI for ${articleId}`, error);
    // Google being overloaded isn't the video's fault: it doesn't use up a try (the wait
    // before the next run still applies, and background runs only look back two weeks).
    if (busy) {
      await prisma.article.update({
        where: { id: article.id },
        // A refine that couldn't run stays due.
        data: refine ? { videoAiAt: article.videoAiAt } : { videoAiAttempts: { decrement: 1 } },
      });
    }
    return busy ? "busy" : "failed";
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What the background runs work on, best first: what you've started or saved (whatever its
 * age), then new episodes and videos from shows and channels you play, then the newest of
 * the rest. The free quota goes where it's used.
 */
export async function videoAiQueue(limit: number) {
  const retryAfter = new Date(Date.now() - 45 * 60 * 1000);
  const ready = {
    AND: [VIDEO_AI_CANDIDATE, { OR: [{ videoAiAt: null }, { videoAiAt: { lt: retryAfter } }] }],
  };
  const played = await prisma.article.findMany({
    where: {
      OR: [{ watchedSeconds: { gt: 0 } }, { readProgress: { gt: 0 } }],
      publishedAt: { gte: new Date(Date.now() - 60 * DAY_MS) },
    },
    distinct: ["feedId"],
    select: { feedId: true },
  });
  const tiers = [
    {
      ...ready,
      OR: [{ isSaved: true }, { watchedSeconds: { gt: 0 } }, { readProgress: { gt: 0 } }],
    },
    {
      ...ready,
      feedId: { in: played.map((p) => p.feedId) },
      createdAt: { gte: new Date(Date.now() - 30 * DAY_MS) },
    },
    { ...ready, createdAt: { gte: new Date(Date.now() - 14 * DAY_MS) } },
  ];
  const ids: string[] = [];
  for (const where of tiers) {
    if (ids.length >= limit) break;
    const found = await prisma.article.findMany({
      where: { ...where, id: { notIn: ids } },
      orderBy: { publishedAt: "desc" },
      take: limit - ids.length,
      select: { id: true },
    });
    ids.push(...found.map((f) => f.id));
  }
  return ids;
}

/**
 * Background runs (the hourly video tick), in videoAiQueue's order, each waiting a bit
 * between attempts. Stops starting new runs past the deadline.
 */
export async function runVideoAiBatch(deadline: number, limit = 3) {
  const fresh = await videoAiQueue(limit);
  // A free slot redoes one old coarse transcript (new ones first: they have nothing yet).
  const refine = fresh.length < limit ? await refineQueue(1) : [];
  const candidates = [
    ...fresh.map((id) => ({ id, refine: false })),
    ...refine.map((id) => ({ id, refine: true })),
  ];
  const results: VideoAiResult[] = [];
  for (const { id, refine } of candidates) {
    const left = deadline - Date.now();
    if (left < 30_000) break;
    const result = await runVideoAi(id, left - 5_000, "background", { refine });
    results.push(result);
    // Overloaded: the next one would fail the same way.
    if (result === "busy") break;
  }
  return results;
}
