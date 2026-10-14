import { readSetting, writeSetting } from "@/lib/push";

// Gemini's free tier has daily limits per kind of call, reset at midnight Pacific time.
// Background work (embedding new articles, screening promotions, video summaries) used to
// spend them all early in the day, so what you open later got "quota exceeded". Here each
// kind of call has a daily budget; background work stops at its share and leaves the rest
// for what you ask for. When Google says the quota is gone anyway, calls of that kind
// pause until it resets instead of failing every hour.

export type AiBucket = "embed" | "text" | "video";
export type AiPriority = "background" | "user";

function limit(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Requests per day (an embedding batch counts one per text). Below Google's free limits. */
export const DAILY_LIMITS: Record<AiBucket, number> = {
  embed: limit("GEMINI_EMBED_DAILY", 800),
  text: limit("GEMINI_TEXT_DAILY", 400),
  video: limit("GEMINI_VIDEO_DAILY", 40),
};
/** What background work may use; the rest waits for things you open. */
export const BACKGROUND_SHARE = 0.75;

const KEY = "ai-budget";

interface BudgetState {
  day: string;
  used: Partial<Record<AiBucket, number>>;
  /** By model (Google's limits are per model): paused until this time (ISO), or "day". */
  pausedUntil: Record<string, string>;
}

/** The day Google's quota counts, as YYYY-MM-DD (it resets at midnight Pacific). */
export function quotaDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

async function load(): Promise<BudgetState> {
  const state = await readSetting<BudgetState>(KEY, { day: "", used: {}, pausedUntil: {} });
  const today = quotaDay();
  if (state.day !== today) return { day: today, used: {}, pausedUntil: {} };
  return state;
}

function paused(state: BudgetState, model: string) {
  const until = state.pausedUntil[model];
  if (!until) return false;
  return until === "day" || new Date(until).getTime() > Date.now();
}

/**
 * Takes `units` from today's budget, or returns false when there isn't enough (for this
 * priority) or Google paused this kind of call. Counts are approximate when two requests
 * run at once, which is fine for a budget kept below the real limit.
 */
export async function reserveAi(
  bucket: AiBucket,
  model: string,
  units: number,
  priority: AiPriority
) {
  const state = await load();
  if (paused(state, model)) return false;
  const used = state.used[bucket] ?? 0;
  const cap = DAILY_LIMITS[bucket] * (priority === "background" ? BACKGROUND_SHARE : 1);
  if (used + units > cap) return false;
  state.used[bucket] = used + units;
  await writeSetting(KEY, state);
  return true;
}

/**
 * After Google answers 429 for a model: a daily quota pauses it until midnight Pacific; a
 * per-minute limit pauses it for the delay Google asks (at least a minute).
 */
export async function noteQuotaError(model: string, detail: string) {
  const state = await load();
  if (/PerDay|per day|daily/i.test(detail)) {
    state.pausedUntil[model] = "day";
  } else {
    const seconds = Number(detail.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/)?.[1] ?? 60);
    state.pausedUntil[model] = new Date(Date.now() + Math.max(60, seconds) * 1000).toISOString();
  }
  await writeSetting(KEY, state);
}

/** Today's use, for Settings. */
export async function aiBudgetStatus() {
  const state = await load();
  return (Object.keys(DAILY_LIMITS) as AiBucket[]).map((bucket) => ({
    bucket,
    used: state.used[bucket] ?? 0,
    limit: DAILY_LIMITS[bucket],
  }));
}

/** Models Google has paused right now (for Settings). */
export async function pausedModels() {
  const state = await load();
  return Object.keys(state.pausedUntil).filter((model) => paused(state, model));
}
