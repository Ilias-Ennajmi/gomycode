/**
 * Thin client for the Gemini API (free tier). Everything here is optional:
 * without GEMINI_API_KEY the app works exactly as before, and any failure
 * (rate limit, outage) degrades to "no AI" instead of breaking a request.
 */

import {
  hasAiBudget,
  noteQuotaError,
  reserveAi,
  type AiBucket,
  type AiPriority,
} from "@/lib/ai-budget";

const BASE_URL = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com";
// Measured on real headlines: gemini-embedding-2 separates "same story" from
// "similar topic" far better than gemini-embedding-001, which scores both ~0.93.
const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || "gemini-embedding-2";
export const EMBED_DIMENSIONS = 256;

// Tried in order; "-latest" aliases survive Google's model retirements.
const TEXT_MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
].filter((m): m is string => Boolean(m));

let workingTextModel: string | null = null;

export class AiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
  }
}

export function isAiEnabled() {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** Out of quota (Google's or today's budget): callers treat it as "try later". */
export function isQuotaError(error: unknown) {
  return error instanceof AiError && error.status === 429;
}

interface Meter {
  bucket: AiBucket;
  /** Requests this call counts as (an embedding batch: one per text). */
  units?: number;
  priority: AiPriority;
}

async function callGemini(
  model: string,
  method: string,
  body: unknown,
  meter: Meter,
  timeoutMs = 25_000
) {
  // Within today's budget (lib/ai-budget.ts), or not sent at all.
  if (!(await reserveAi(meter.bucket, model, meter.units ?? 1, meter.priority))) {
    throw new AiError(`Gemini ${model}: today's ${meter.bucket} budget is used up`, 429);
  }
  const res = await fetch(`${BASE_URL}/v1beta/models/${model}:${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY ?? "",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (res.status === 429) await noteQuotaError(model, detail).catch(() => {});
    throw new AiError(
      `Gemini ${method} failed (${res.status}): ${detail.slice(0, 200)}`,
      res.status
    );
  }
  return res.json();
}

function normalize(vector: number[]) {
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => v / norm);
}

export function cosine(a: number[], b: number[]) {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/** Unit-length embeddings, one per input, for spotting the same story across sources. */
export async function embedTexts(
  texts: string[],
  priority: AiPriority = "background"
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const data = await callGemini(
    EMBED_MODEL,
    "batchEmbedContents",
    {
      requests: texts.map((text) => ({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text: text.slice(0, 2000) }] },
        taskType: "SEMANTIC_SIMILARITY",
        outputDimensionality: EMBED_DIMENSIONS,
      })),
    },
    { bucket: "embed", units: texts.length, priority }
  );
  const embeddings = (data.embeddings ?? []) as { values: number[] }[];
  if (embeddings.length !== texts.length) throw new AiError("Gemini returned too few embeddings");
  return embeddings.map((e) => normalize(e.values));
}

interface GenerateOptions {
  system?: string;
  json?: boolean;
  maxTokens?: number;
  /** "background" for work nobody is waiting for: it stops earlier in the day. */
  priority?: AiPriority;
}

export async function generateText(prompt: string, options: GenerateOptions = {}) {
  // The model that worked last time first, then the others.
  const models = workingTextModel
    ? [workingTextModel, ...TEXT_MODELS.filter((m) => m !== workingTextModel)]
    : TEXT_MODELS;
  let lastError: unknown;

  for (const model of models) {
    try {
      const data = await callGemini(
        model,
        "generateContent",
        {
          ...(options.system && { systemInstruction: { parts: [{ text: options.system }] } }),
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: options.maxTokens ?? 400,
            ...(options.json && { responseMimeType: "application/json" }),
          },
        },
        { bucket: "text", priority: options.priority ?? "user" }
      );
      workingTextModel = model;
      const parts = data.candidates?.[0]?.content?.parts as { text?: string }[] | undefined;
      const text = parts
        ?.map((p) => p.text ?? "")
        .join("")
        .trim();
      if (!text) throw new AiError("Gemini returned an empty response");
      return text;
    } catch (error) {
      lastError = error;
      // A missing model, or one out of quota (Google counts per model): try the next.
      if (!(error instanceof AiError && (error.status === 404 || error.status === 429))) {
        throw error;
      }
    }
  }
  throw lastError;
}

// Video understanding: better with the full Flash model; the lighter one takes over when
// Google reports it overloaded (503), which happens often on the free tier.
const VIDEO_MODELS = [
  process.env.GEMINI_VIDEO_MODEL,
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
].filter((m): m is string => Boolean(m));

/**
 * Asks Gemini about a public YouTube video, which Google reads on its side (YouTube blocks
 * servers from reading captions). Few frames and low resolution: the words matter here, and
 * a minute of video costs about 3,000 tokens this way. Returns JSON text.
 */
export async function generateFromVideo(
  videoUrl: string,
  prompt: string,
  options: { timeoutMs: number; maxTokens: number; priority: AiPriority }
) {
  return generateFromMedia(
    { fileData: { fileUri: videoUrl }, videoMetadata: { fps: 0.2 } },
    prompt,
    options
  );
}

/** One media part (a video link or an uploaded file) and a prompt → JSON text. */
async function generateFromMedia(
  media: Record<string, unknown>,
  prompt: string,
  options: { timeoutMs: number; maxTokens: number; priority: AiPriority }
) {
  const started = Date.now();
  let lastError: unknown;
  for (const model of VIDEO_MODELS) {
    const left = options.timeoutMs - (Date.now() - started);
    if (left < 10_000) break;
    try {
      const data = await callGemini(
        model,
        "generateContent",
        {
          contents: [{ role: "user", parts: [media, { text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: options.maxTokens,
            responseMimeType: "application/json",
            mediaResolution: "MEDIA_RESOLUTION_LOW",
          },
        },
        { bucket: "video", priority: options.priority },
        left
      );
      const parts = data.candidates?.[0]?.content?.parts as { text?: string }[] | undefined;
      const text = parts
        ?.map((p) => p.text ?? "")
        .join("")
        .trim();
      if (!text) throw new AiError("Gemini returned an empty response");
      return text;
    } catch (error) {
      lastError = error;
      const status = error instanceof AiError ? error.status : undefined;
      if (status !== 404 && status !== 503 && status !== 429) throw error;
    }
  }
  throw lastError ?? new AiError("Gemini took too long", 503);
}

// Audio types Gemini accepts; podcast feeds mostly say audio/mpeg (MP3) or audio/x-m4a.
function geminiAudioType(type: string | null, url: string) {
  const value = `${type ?? ""} ${url}`.toLowerCase();
  if (/wav/.test(value)) return "audio/wav";
  if (/ogg|opus/.test(value)) return "audio/ogg";
  if (/flac/.test(value)) return "audio/flac";
  if (/aac|m4a|mp4/.test(value)) return "audio/aac";
  return "audio/mp3";
}

/** Larger files would take too long to move within one run. */
const MAX_AUDIO_BYTES = 250 * 1024 * 1024;

/**
 * Puts a podcast episode's audio in Gemini's file store (kept 48 hours, free), since
 * Gemini can't fetch it from the podcast's server itself. Returns the file to refer to.
 */
async function uploadAudio(audioUrl: string, audioType: string | null, deadline: number) {
  const download = await fetch(audioUrl, {
    redirect: "follow",
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Reader podcast player)" },
    signal: AbortSignal.timeout(Math.max(5_000, deadline - Date.now())),
  });
  if (!download.ok) throw new AiError(`The episode's audio didn't load (${download.status})`);
  const size = Number(download.headers.get("content-length") ?? 0);
  if (size > MAX_AUDIO_BYTES) throw new AiError("The episode is too large to analyze");
  const bytes = new Uint8Array(await download.arrayBuffer());
  if (bytes.byteLength > MAX_AUDIO_BYTES) throw new AiError("The episode is too large to analyze");
  const mimeType = geminiAudioType(audioType, download.url || audioUrl);
  const key = process.env.GEMINI_API_KEY ?? "";

  const start = await fetch(`${BASE_URL}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": key,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: "podcast-episode" } }),
    signal: AbortSignal.timeout(20_000),
  });
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!start.ok || !uploadUrl) {
    throw new AiError(`Gemini file upload failed (${start.status})`, start.status);
  }
  const finish = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: bytes,
    signal: AbortSignal.timeout(Math.max(10_000, deadline - Date.now())),
  });
  if (!finish.ok) throw new AiError(`Gemini file upload failed (${finish.status})`, finish.status);
  let file = ((await finish.json()) as { file?: GeminiFile }).file;
  if (!file?.name || !file.uri) throw new AiError("Gemini didn't keep the file");

  // Audio is usually ready at once; wait for it if not.
  while (file.state === "PROCESSING" && Date.now() < deadline - 15_000) {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    const res = await fetch(`${BASE_URL}/v1beta/${file.name}`, {
      headers: { "x-goog-api-key": key },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) file = (await res.json()) as GeminiFile;
  }
  if (file.state === "FAILED") throw new AiError("Gemini couldn't read this audio");
  return { name: file.name, uri: file.uri, mimeType: file.mimeType || mimeType };
}

interface GeminiFile {
  name: string;
  uri: string;
  mimeType?: string;
  state?: "PROCESSING" | "ACTIVE" | "FAILED";
}

function deleteFile(name: string) {
  return fetch(`${BASE_URL}/v1beta/${name}`, {
    method: "DELETE",
    headers: { "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}

/** Asks Gemini about a podcast episode (it listens to the audio). Returns JSON text. */
export async function generateFromAudio(
  audio: { url: string; type: string | null },
  prompt: string,
  options: { timeoutMs: number; maxTokens: number; priority: AiPriority }
) {
  const started = Date.now();
  // Checked before moving the file, so an empty budget costs nothing.
  if (!(await hasAiBudget("video", options.priority))) {
    throw new AiError("Today's video & audio budget is used up", 429);
  }
  const file = await uploadAudio(audio.url, audio.type, started + options.timeoutMs);
  try {
    return await generateFromMedia(
      { fileData: { fileUri: file.uri, mimeType: file.mimeType } },
      prompt,
      { ...options, timeoutMs: options.timeoutMs - (Date.now() - started) }
    );
  } finally {
    void deleteFile(file.name);
  }
}

export async function summarizeArticle(title: string, text: string) {
  return generateText(`Title: ${title}\n\n${text.slice(0, 12_000)}`, {
    system:
      "Summarize the article in 2-4 plain sentences for a busy reader. State the key facts and why they matter. " +
      "No preamble, no bullet points, no markdown. Write in the article's language.",
    maxTokens: 300,
  });
}

/** Returns the ids of items that are ads, sponsored posts, or shopping deals. */
export async function findPromotions(items: { id: string; title: string; summary: string }[]) {
  if (items.length === 0) return new Set<string>();
  const list = items
    .map((item, i) => `${i + 1}. ${item.title} — ${item.summary.slice(0, 160)}`)
    .join("\n");
  const raw = await generateText(list, {
    system:
      "You flag promotional posts in a news feed: sponsored content, ads, affiliate shopping deals, " +
      "discount or coupon posts, and 'best deals' roundups. Ordinary news and reviews are not promotional. " +
      'Reply with JSON: {"promotional": [list of item numbers]}.',
    json: true,
    maxTokens: 200,
    priority: "background",
  });
  const numbers = (JSON.parse(raw).promotional ?? []) as unknown[];
  return new Set(
    numbers.map((n) => items[Number(n) - 1]?.id).filter((id): id is string => Boolean(id))
  );
}
