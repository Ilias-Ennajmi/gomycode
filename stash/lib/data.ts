"use client";

import { getBrowserClient } from "@/lib/supabase/client";
import type { Platform } from "@/lib/links";
import type { Enums, Json } from "@/lib/supabase/types";
import { SPACE_COLORS, type SpaceColor } from "@/components/ui/space";
import { CONTEXT_LABEL, isContextRule, nextWeekendMorning, type ContextRule } from "@/lib/contextRules";

export type Space = {
  id: string;
  name: string;
  kind: Enums<"space_kind">;
  color: SpaceColor;
  sortOrder: number;
  description: string | null;
  dueDate: string | null;
  /** Key in components/ui/spaceIcons (optional: older cached copies don't have it). */
  icon?: string | null;
};

export type Segment = { start: number; end: number; text: string };

export type SaveItem = {
  id: string;
  clientId: string | null;
  sourceUrl: string;
  platform: Platform;
  status: Enums<"save_status">;
  spaceId: string | null;
  thumbPath: string | null;
  hasVideo: boolean;
  /** Storage path of the stored MP4 (bucket stash-video); null when there is none. */
  videoPath?: string | null;
  // Written by the worker (contract 0007). Optional: older cached copies don't have them.
  processStep?: Enums<"process_step">;
  videoState?: Enums<"video_state">;
  playback?: Enums<"playback">;
  embedUrl?: string | null;
  aiState?: Enums<"ai_state">;
  duration: number | null;
  creator: string | null;
  caption: string | null;
  title: string | null;
  error: string | null;
  savedAt: string;
  userNote: string | null;
  voiceNotePath: string | null;
  // insights
  aiTitle: string | null;
  keyIdea: string | null;
  takeaways: string[];
  actions: string[];
  tags: string[];
  suggestedSpaceId: string | null;
  // loop state
  watchedAt: string | null;
  kept: boolean;
  archivedAt: string | null;
  appliedAt: string | null;
  skipCount: number;
};

type InsightRow = {
  title: string | null;
  key_idea: string | null;
  takeaways: Json;
  actions: Json;
  tags: string[] | null;
  suggested_space_id?: string | null;
};
type StateRow = {
  watched_at: string | null;
  kept: boolean;
  archived_at: string | null;
  applied_at: string | null;
  skip_count?: number | null;
};
type SaveRow = {
  id: string;
  client_id: string | null;
  source_url: string;
  platform: Platform;
  status: Enums<"save_status">;
  space_id: string | null;
  thumb_path: string | null;
  video_path: string | null;
  process_step?: Enums<"process_step"> | null;
  video_state?: Enums<"video_state"> | null;
  playback?: Enums<"playback"> | null;
  embed_url?: string | null;
  ai_state?: Enums<"ai_state"> | null;
  duration_s: number | null;
  creator_handle: string | null;
  caption: string | null;
  title: string | null;
  error: string | null;
  saved_at: string;
  user_note: string | null;
  voice_note_path: string | null;
  insights: InsightRow | InsightRow[] | null;
  states: StateRow | StateRow[] | null;
};

const SAVE_SELECT =
  "id,client_id,source_url,platform,status,space_id,thumb_path,video_path,process_step,video_state,playback,embed_url,ai_state,duration_s,creator_handle,caption,title,error,saved_at,user_note,voice_note_path," +
  "insights(title,key_idea,takeaways,actions,tags,suggested_space_id),states(watched_at,kept,archived_at,applied_at,skip_count)";

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const strings = (v: Json | undefined): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export type { SaveRow };

export function toSaveItem(row: SaveRow): SaveItem {
  const ins = one(row.insights);
  const st = one(row.states);
  return {
    id: row.id,
    clientId: row.client_id,
    sourceUrl: row.source_url,
    platform: row.platform,
    status: row.status,
    spaceId: row.space_id,
    thumbPath: row.thumb_path,
    hasVideo: Boolean(row.video_path),
    videoPath: row.video_path,
    processStep: row.process_step ?? (row.status === "queued" ? "queued" : row.status === "processing" ? "fetching" : "ready"),
    videoState: row.video_state ?? (row.video_path ? "stored" : "none"),
    playback: row.playback ?? (row.video_path ? "video" : "link"),
    embedUrl: row.embed_url ?? null,
    aiState: row.ai_state ?? "pending",
    duration: row.duration_s === null ? null : Number(row.duration_s),
    creator: row.creator_handle,
    caption: row.caption,
    title: row.title,
    error: row.error,
    savedAt: row.saved_at,
    userNote: row.user_note,
    voiceNotePath: row.voice_note_path,
    aiTitle: ins?.title ?? null,
    keyIdea: ins?.key_idea ?? null,
    takeaways: strings(ins?.takeaways),
    actions: strings(ins?.actions),
    tags: ins?.tags ?? [],
    suggestedSpaceId: ins?.suggested_space_id ?? null,
    watchedAt: st?.watched_at ?? null,
    kept: st?.kept ?? false,
    archivedAt: st?.archived_at ?? null,
    appliedAt: st?.applied_at ?? null,
    skipCount: st?.skip_count ?? 0,
  };
}

function client() {
  const supabase = getBrowserClient();
  if (!supabase) throw new Error("Supabase isn't configured");
  return supabase;
}

const asColor = (c: string): SpaceColor => ((SPACE_COLORS as readonly string[]).includes(c) ? (c as SpaceColor) : "violet");

export async function fetchSpaces(): Promise<Space[]> {
  const { data, error } = await client()
    .from("spaces")
    .select("id,name,kind,color_token,sort_order,description,due_date,icon")
    .eq("archived", false)
    .order("sort_order")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    color: asColor(s.color_token),
    sortOrder: s.sort_order,
    description: s.description,
    dueDate: s.due_date,
    icon: s.icon,
  }));
}

export async function fetchSaves(opts: { ids?: string[]; limit?: number } = {}): Promise<SaveItem[]> {
  let q = client().from("saves").select(SAVE_SELECT).order("saved_at", { ascending: false }).limit(opts.limit ?? 500);
  if (opts.ids) q = q.in("id", opts.ids.length ? opts.ids : ["00000000-0000-0000-0000-000000000000"]);
  const { data, error } = await q.overrideTypes<SaveRow[], { merge: false }>();
  if (error) throw error;
  return (data ?? []).map(toSaveItem);
}

export async function fetchSave(id: string): Promise<SaveItem | null> {
  const { data, error } = await client()
    .from("saves")
    .select(SAVE_SELECT)
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<SaveRow, { merge: false }>();
  if (error) throw error;
  return data ? toSaveItem(data) : null;
}

function toSegments(raw: unknown): Segment[] {
  const segs = Array.isArray(raw) ? (raw as unknown[]) : [];
  return segs
    .map((s) => s as Partial<Segment>)
    .filter((s) => typeof s.text === "string" && typeof s.start === "number")
    .map((s) => ({ start: s.start as number, end: (s.end as number) ?? (s.start as number), text: s.text as string }));
}

export async function fetchTranscript(saveId: string): Promise<Segment[]> {
  const { data } = await client().from("transcripts").select("segments").eq("save_id", saveId).maybeSingle();
  return toSegments(data?.segments);
}

/** Timed lines (videos) and the whole text (articles have text and no lines). */
export async function fetchTranscriptFull(saveId: string): Promise<{ segments: Segment[]; fullText: string }> {
  const { data } = await client().from("transcripts").select("segments,full_text").eq("save_id", saveId).maybeSingle();
  return { segments: toSegments(data?.segments), fullText: typeof data?.full_text === "string" ? data.full_text : "" };
}

/** Live changes carry the save's own columns only: fold them into the copy on screen. */
export function applySaveRow(item: SaveItem, row: Partial<SaveRow>): SaveItem {
  const next = { ...item };
  if (row.status !== undefined) next.status = row.status;
  if (row.title !== undefined) next.title = row.title;
  if (row.caption !== undefined) next.caption = row.caption;
  if (row.creator_handle !== undefined) next.creator = row.creator_handle;
  if (row.thumb_path !== undefined) next.thumbPath = row.thumb_path;
  if (row.duration_s !== undefined) next.duration = row.duration_s === null ? null : Number(row.duration_s);
  if (row.error !== undefined) next.error = row.error;
  if (row.space_id !== undefined) next.spaceId = row.space_id;
  if (row.video_path !== undefined) {
    next.videoPath = row.video_path;
    next.hasVideo = Boolean(row.video_path);
  }
  if (row.process_step) next.processStep = row.process_step;
  if (row.video_state) next.videoState = row.video_state;
  if (row.playback) next.playback = row.playback;
  if (row.embed_url !== undefined) next.embedUrl = row.embed_url;
  if (row.ai_state) next.aiState = row.ai_state;
  return next;
}

export async function fetchRelated(saveId: string): Promise<string[]> {
  const { data } = await client().rpc("related_saves", { p_save_id: saveId, p_limit: 6 });
  return (data ?? []).map((r) => r.save_id);
}

export type StatePatch = Partial<Pick<StateRow, "watched_at" | "kept" | "archived_at" | "applied_at">> & { skip_count?: number };

export async function setState(saveId: string, patch: StatePatch): Promise<void> {
  const { error } = await client().from("states").update(patch).eq("save_id", saveId);
  if (error) throw error;
}

export async function moveToSpace(saveId: string, spaceId: string | null): Promise<void> {
  const { error } = await client().from("saves").update({ space_id: spaceId }).eq("id", saveId);
  if (error) throw error;
}

export async function saveNote(saveId: string, note: string): Promise<void> {
  const { error } = await client().from("saves").update({ user_note: note.trim() || null }).eq("id", saveId);
  if (error) throw error;
}

export async function deleteSave(saveId: string): Promise<void> {
  const { error } = await client().from("saves").delete().eq("id", saveId);
  if (error) throw error;
}

export async function reprocess(saveId: string): Promise<void> {
  const { error } = await client().rpc("request_reprocess", { p_save_id: saveId });
  if (error) throw error;
}

export async function createSpace(name: string, color: SpaceColor, kind: "topic" | "project" = "topic"): Promise<Space> {
  const { data, error } = await client()
    .from("spaces")
    .insert({ name: name.trim(), color_token: color, kind })
    .select("id,name,kind,color_token,sort_order,description,due_date,icon")
    .single();
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    kind: data.kind,
    color: asColor(data.color_token),
    sortOrder: data.sort_order,
    description: data.description,
    dueDate: data.due_date,
    icon: data.icon,
  };
}

export type SpacePatch = {
  name?: string;
  color_token?: SpaceColor;
  kind?: "topic" | "project";
  icon?: string | null;
  due_date?: string | null;
  description?: string | null;
};

export async function updateSpace(id: string, values: SpacePatch) {
  const { error } = await client().from("spaces").update(values).eq("id", id);
  if (error) throw error;
}

export async function archiveSpace(id: string) {
  const { error } = await client().from("spaces").update({ archived: true }).eq("id", id);
  if (error) throw error;
}

export type ReminderChoice = "tonight" | "weekend" | "date" | "nearby" | ContextRule;

/** What a reminder chip says once set. */
export function reminderLabel(choice: ReminderChoice, date?: string): string {
  if (isContextRule(choice)) return CONTEXT_LABEL[choice];
  if (choice === "nearby") return "When you're nearby";
  if (choice === "tonight") return "Tonight";
  if (choice === "weekend") return "This weekend";
  return date ?? "Set";
}

export function reminderTime(choice: ReminderChoice, date?: string, now = new Date()): string | null {
  const d = new Date(now);
  if (choice === "tonight") {
    d.setHours(20, 0, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    return d.toISOString();
  }
  if (choice === "weekend") {
    const toSat = (6 - d.getDay() + 7) % 7 || (d.getHours() >= 10 ? 7 : 0);
    d.setDate(d.getDate() + toSat);
    d.setHours(10, 0, 0, 0);
    return d.toISOString();
  }
  if (choice === "date" && date) {
    const picked = new Date(`${date}T09:00:00`);
    return Number.isNaN(picked.getTime()) ? null : picked.toISOString();
  }
  if (choice === "weekend_morning") return nextWeekendMorning(now).toISOString();
  return null; // place and the other context rules fire on the phone
}

export async function addReminder(saveId: string, choice: ReminderChoice, date?: string): Promise<void> {
  const kind = choice === "nearby" ? "place" : isContextRule(choice) ? "context" : "time";
  const { error } = await client()
    .from("reminders")
    .insert({ save_id: saveId, kind, fire_at: reminderTime(choice, date), rule: isContextRule(choice) ? { type: choice } : null });
  if (error) throw error;
}

/** Spaces ordered by how many saves each holds (for the save sheet's top 3). */
export function mostUsed(spaces: Space[], saves: Pick<SaveItem, "spaceId">[], n = 3): Space[] {
  const counts = new Map<string, number>();
  for (const s of saves) if (s.spaceId) counts.set(s.spaceId, (counts.get(s.spaceId) ?? 0) + 1);
  return spaces
    .filter((s) => s.kind !== "inbox")
    .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.sortOrder - b.sortOrder)
    .slice(0, n);
}

export function nextSpaceColor(spaces: Space[]): SpaceColor {
  const used = new Set(spaces.map((s) => s.color));
  return SPACE_COLORS.find((c) => c !== "inbox" && !used.has(c)) ?? "violet";
}
