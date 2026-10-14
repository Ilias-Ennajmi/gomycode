/**
 * Thin client for the Gemini API (free tier). Everything here is optional:
 * without GEMINI_API_KEY the app works exactly as before, and any failure
 * (rate limit, outage) degrades to "no AI" instead of breaking a request.
 */

import { noteQuotaError, reserveAi, type AiBucket, type AiPriority } from "@/lib/ai-budget";

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
export async function embedTexts(texts: string[]): Promise<number[][]> {
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
    { bucket: "embed", units: texts.length, priority: "background" }
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
  let lastError: unknown;
  for (const model of VIDEO_MODELS) {
    try {
      const data = await callGemini(
        model,
        "generateContent",
        {
          contents: [
            {
              role: "user",
              parts: [
                { fileData: { fileUri: videoUrl }, videoMetadata: { fps: 0.2 } },
                { text: prompt },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: options.maxTokens,
            responseMimeType: "application/json",
            mediaResolution: "MEDIA_RESOLUTION_LOW",
          },
        },
        { bucket: "video", priority: options.priority },
        options.timeoutMs
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
  throw lastError;
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
