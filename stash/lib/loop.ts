"use client";

/*
 * Client data for the loop: today's queue, recall cards and reviews, syntheses,
 * fired reminders and the loop settings. Every call runs as the owner (RLS).
 */

import { getBrowserClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/types";
import { buildDailyQueue, normalizeMinutes, type QueueCandidate } from "@/lib/dailyQueue";
import { DEFAULT_QUIET, DEFAULT_TIMEZONE, parseQuiet, type QuietHours } from "@/lib/quietHours";
import { sm2, type Scheduled } from "@/lib/sm2";
import type { SaveItem, Space } from "@/lib/data";

function client() {
  const supabase = getBrowserClient();
  if (!supabase) throw new Error("Supabase isn't configured");
  return supabase;
}

// --- Settings ---------------------------------------------------------------

export type LoopSettings = { queueMinutes: number; queueTime: string; quietHours: QuietHours; timezone: string };

export const DEFAULT_LOOP: LoopSettings = {
  queueMinutes: 6,
  queueTime: "08:00",
  quietHours: DEFAULT_QUIET,
  timezone: DEFAULT_TIMEZONE,
};

const SETTINGS_KEY = "stash.loop.settings";

export function readLoopSettings(): LoopSettings {
  try {
    return { ...DEFAULT_LOOP, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<LoopSettings>) };
  } catch {
    return DEFAULT_LOOP;
  }
}

function storeLoopSettings(s: LoopSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // a convenience only
  }
}

export async function fetchLoopSettings(): Promise<LoopSettings> {
  const { data, error } = await client()
    .from("settings")
    .select("queue_minutes,queue_time,quiet_hours,timezone")
    .maybeSingle();
  if (error) throw error;
  const s: LoopSettings = data
    ? {
        queueMinutes: normalizeMinutes(data.queue_minutes),
        queueTime: String(data.queue_time ?? "08:00").slice(0, 5),
        quietHours: parseQuiet(data.quiet_hours) ?? DEFAULT_QUIET,
        timezone: data.timezone || DEFAULT_TIMEZONE,
      }
    : readLoopSettings();
  storeLoopSettings(s);
  return s;
}

export async function saveLoopSettings(patch: Partial<LoopSettings>): Promise<LoopSettings> {
  const next = { ...readLoopSettings(), ...patch };
  storeLoopSettings(next);
  const supabase = client();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("no session");
  const values: { queue_minutes?: number; queue_time?: string; quiet_hours?: Json; timezone?: string } = {};
  if (patch.queueMinutes !== undefined) values.queue_minutes = normalizeMinutes(patch.queueMinutes);
  if (patch.queueTime !== undefined) values.queue_time = patch.queueTime;
  if (patch.quietHours !== undefined) values.quiet_hours = patch.quietHours;
  if (patch.timezone !== undefined) values.timezone = patch.timezone;
  const { error } = await supabase.from("settings").update(values).eq("user_id", auth.user.id);
  if (error) throw error;
  return next;
}

/** The phone's IANA time zone, used to read queue time and quiet hours. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

// --- Daily queue -----------------------------------------------------------------

export type DailyQueue = { day: string; saveIds: string[]; doneIds: string[]; minutes: number };

export async function fetchDailyQueue(day: string): Promise<DailyQueue | null> {
  const { data, error } = await client()
    .from("daily_queues")
    .select("day,save_ids,done_ids,minutes")
    .eq("day", day)
    .maybeSingle();
  if (error) throw error;
  return data ? { day: data.day, saveIds: data.save_ids, doneIds: data.done_ids, minutes: data.minutes } : null;
}

/** Saves the queue for the day; a rebuild keeps what's already done. */
export async function storeDailyQueue(day: string, saveIds: string[], minutes: number): Promise<void> {
  const supabase = client();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("no session");
  const { error } = await supabase
    .from("daily_queues")
    .upsert(
      { user_id: auth.user.id, day, save_ids: saveIds, minutes, built_at: new Date().toISOString() },
      { onConflict: "user_id,day" },
    );
  if (error) throw error;
}

export async function markQueueDone(day: string, saveId: string): Promise<void> {
  const { error } = await client().rpc("mark_queue_done", { p_day: day, p_save_id: saveId });
  if (error) throw error;
}

/** Library rows → builder candidates (what the cron route gets from SQL). */
export function toCandidates(saves: SaveItem[], spaces: Space[], dueCardSaveIds: Set<string>): QueueCandidate[] {
  const byId = new Map(spaces.map((s) => [s.id, s]));
  return saves.map((s) => {
    const sp = s.spaceId ? byId.get(s.spaceId) : undefined;
    return {
      id: s.id,
      status: s.status,
      savedAt: s.savedAt,
      duration: s.duration,
      spaceId: s.spaceId,
      spaceKind: sp?.kind ?? null,
      spaceDueDate: sp?.dueDate ?? null,
      watchedAt: s.watchedAt,
      archivedAt: s.archivedAt,
      kept: s.kept,
      appliedAt: s.appliedAt,
      skipCount: s.skipCount,
      hasDueCard: dueCardSaveIds.has(s.id),
    };
  });
}

export function buildForDay(
  saves: SaveItem[],
  spaces: Space[],
  dueCardSaveIds: Set<string>,
  day: string,
  minutes: number,
  seed?: string,
): string[] {
  return buildDailyQueue(toCandidates(saves, spaces, dueCardSaveIds), { day, minutes, seed });
}

// --- Recall cards ------------------------------------------------------------------

export type RecallCard = {
  id: string;
  saveId: string;
  prompt: string;
  answer: string;
  ease: number;
  intervalDays: number;
  repetitions: number;
  dueAt: string;
};

export async function fetchDueCards(): Promise<RecallCard[]> {
  const { data, error } = await client()
    .from("cards")
    .select("id,save_id,prompt,answer,ease,interval_days,repetitions,due_at")
    .lte("due_at", new Date().toISOString())
    .order("due_at")
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id,
    saveId: c.save_id,
    prompt: c.prompt,
    answer: c.answer,
    ease: Number(c.ease),
    intervalDays: c.interval_days,
    repetitions: c.repetitions,
    dueAt: c.due_at,
  }));
}

export type Review = { cardId: string; answeredAt: string; grade: number | null; text: string | null; feedback: string | null };

export async function fetchReviewsSince(since: Date): Promise<Review[]> {
  const { data, error } = await client()
    .from("reviews")
    .select("card_id,answered_at,grade,voice_answer_text,feedback")
    .gte("answered_at", since.toISOString())
    .order("answered_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    cardId: r.card_id,
    answeredAt: r.answered_at,
    grade: r.grade,
    text: r.voice_answer_text,
    feedback: r.feedback,
  }));
}

/** Self-grade: the review and the new schedule. The caller has already updated the screen. */
export async function gradeCard(card: RecallCard, grade: number, now = new Date()): Promise<Scheduled> {
  const next = sm2(card, grade, now);
  const supabase = client();
  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    supabase.from("reviews").insert({ card_id: card.id, grade, answered_at: now.toISOString() }),
    supabase
      .from("cards")
      .update({ ease: next.ease, interval_days: next.intervalDays, repetitions: next.repetitions, due_at: next.dueAt })
      .eq("id", card.id),
  ]);
  if (e1 || e2) throw e1 ?? e2;
  return next;
}

const EXT: Record<string, string> = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3" };

/** Uploads a spoken answer to the owner's answers folder and asks the worker to grade it. Returns the job id. */
export async function requestGrade(card: RecallCard, answer: { audio: Blob; mime: string } | { text: string }): Promise<string> {
  const supabase = client();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("no session");
  let payload: { card_id: string; audio_path?: string; text?: string };
  if ("audio" in answer) {
    const path = `${auth.user.id}/answers/${card.id}-${Date.now()}.${EXT[answer.mime] ?? "webm"}`;
    const { error } = await supabase.storage.from("stash-voice").upload(path, answer.audio, { contentType: answer.mime });
    if (error) throw error;
    payload = { card_id: card.id, audio_path: path };
  } else {
    payload = { card_id: card.id, text: answer.text.slice(0, 2000) };
  }
  const { data, error } = await supabase
    .from("jobs")
    .insert({ type: "grade", save_id: card.saveId, payload })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/**
 * Waits for the worker's grade: Realtime on reviews and jobs, with a poll as
 * the fallback. Resolves null on failure or timeout (the self-grade buttons stay).
 */
export function waitForGrade(cardId: string, jobId: string, since: Date, timeoutMs = 90_000): { promise: Promise<Review | null>; cancel: () => void } {
  const supabase = client();
  let done = false;
  let finish: (r: Review | null) => void = () => {};
  const promise = new Promise<Review | null>((resolve) => {
    finish = (r) => {
      if (done) return;
      done = true;
      resolve(r);
    };
  });

  const check = async () => {
    const [{ data: rev }, { data: job }] = await Promise.all([
      supabase
        .from("reviews")
        .select("card_id,answered_at,grade,voice_answer_text,feedback")
        .eq("card_id", cardId)
        .gte("answered_at", since.toISOString())
        .not("voice_answer_text", "is", null)
        .order("answered_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("jobs").select("state").eq("id", jobId).maybeSingle(),
    ]);
    if (rev) {
      finish({ cardId, answeredAt: rev.answered_at, grade: rev.grade, text: rev.voice_answer_text, feedback: rev.feedback });
    } else if (job?.state === "failed") {
      finish(null);
    }
  };

  const channel = supabase
    .channel(`stash-grade-${jobId}`)
    .on("postgres_changes", { event: "INSERT", schema: "stash", table: "reviews", filter: `card_id=eq.${cardId}` }, () => void check())
    .on("postgres_changes", { event: "UPDATE", schema: "stash", table: "jobs", filter: `id=eq.${jobId}` }, () => void check())
    .subscribe();
  const poll = setInterval(() => void check().catch(() => {}), 4000);
  const timer = setTimeout(() => finish(null), timeoutMs);

  const cancel = () => {
    clearInterval(poll);
    clearTimeout(timer);
    void supabase.removeChannel(channel);
    finish(null);
  };
  void promise.then(cancel);
  return { promise, cancel };
}

// --- Syntheses and reminders ----------------------------------------------------------

export type SynthesisItem = {
  id: string;
  spaceId: string | null;
  topic: string | null;
  points: string[];
  disagreements: { point: string; saveIds: string[] }[];
  suggestedAction: string | null;
  saveCount: number;
  createdAt: string;
};

export async function fetchSyntheses(limit = 10): Promise<SynthesisItem[]> {
  const { data, error } = await client()
    .from("syntheses")
    .select("id,space_id,topic,points,disagreements,suggested_action,source_save_ids,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((s) => ({
    id: s.id,
    spaceId: s.space_id,
    topic: s.topic,
    points: Array.isArray(s.points) ? s.points.filter((p): p is string => typeof p === "string") : [],
    disagreements: Array.isArray(s.disagreements)
      ? s.disagreements.flatMap((d) => {
          if (!d || typeof d !== "object" || Array.isArray(d)) return [];
          const ids = Array.isArray(d.save_ids) ? d.save_ids.filter((x): x is string => typeof x === "string") : [];
          return typeof d.point === "string" && ids.length ? [{ point: d.point, saveIds: ids }] : [];
        })
      : [],
    suggestedAction: s.suggested_action,
    saveCount: s.source_save_ids.length,
    createdAt: s.created_at,
  }));
}

export type FiredReminder = { id: string; saveId: string; fireAt: string };

export async function fetchFiredReminders(days = 3): Promise<FiredReminder[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await client()
    .from("reminders")
    .select("id,save_id,fire_at")
    .eq("kind", "time")
    .lte("fire_at", new Date().toISOString())
    .gte("fire_at", since)
    .order("fire_at", { ascending: false })
    .limit(5);
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, saveId: r.save_id, fireAt: r.fire_at as string }));
}
