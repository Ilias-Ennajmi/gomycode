"use client";

import { getBrowserClient } from "@/lib/supabase/client";
import type { Platform } from "@/lib/links";
import type { Enums, Json } from "@/lib/supabase/types";
import { SPACE_COLORS, type SpaceColor } from "@/components/ui/space";

export type Space = {
  id: string;
  name: string;
  kind: Enums<"space_kind">;
  color: SpaceColor;
  sortOrder: number;
  description: string | null;
  dueDate: string | null;
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
  // loop state
  watchedAt: string | null;
  kept: boolean;
  archivedAt: string | null;
  appliedAt: string | null;
};

type InsightRow = { title: string | null; key_idea: string | null; takeaways: Json; actions: Json; tags: string[] | null };
type StateRow = { watched_at: string | null; kept: boolean; archived_at: string | null; applied_at: string | null };
type SaveRow = {
  id: string;
  client_id: string | null;
  source_url: string;
  platform: Platform;
  status: Enums<"save_status">;
  space_id: string | null;
  thumb_path: string | null;
  video_path: string | null;
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
  "id,client_id,source_url,platform,status,space_id,thumb_path,video_path,duration_s,creator_handle,caption,title,error,saved_at,user_note,voice_note_path," +
  "insights(title,key_idea,takeaways,actions,tags),states(watched_at,kept,archived_at,applied_at)";

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const strings = (v: Json | undefined): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

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
    watchedAt: st?.watched_at ?? null,
    kept: st?.kept ?? false,
    archivedAt: st?.archived_at ?? null,
    appliedAt: st?.applied_at ?? null,
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
    .select("id,name,kind,color_token,sort_order,description,due_date")
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

export async function fetchTranscript(saveId: string): Promise<Segment[]> {
  const { data } = await client().from("transcripts").select("segments").eq("save_id", saveId).maybeSingle();
  const segs = Array.isArray(data?.segments) ? (data.segments as unknown[]) : [];
  return segs
    .map((s) => s as Partial<Segment>)
    .filter((s) => typeof s.text === "string" && typeof s.start === "number")
    .map((s) => ({ start: s.start as number, end: (s.end as number) ?? (s.start as number), text: s.text as string }));
}

export async function fetchRelated(saveId: string): Promise<string[]> {
  const { data } = await client().rpc("related_saves", { p_save_id: saveId, p_limit: 6 });
  return (data ?? []).map((r) => r.save_id);
}

export type StatePatch = Partial<Pick<StateRow, "watched_at" | "kept" | "archived_at" | "applied_at">>;

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
    .select("id,name,kind,color_token,sort_order,description,due_date")
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
  };
}

export async function updateSpace(id: string, values: { name?: string; color_token?: SpaceColor; kind?: "topic" | "project" }) {
  const { error } = await client().from("spaces").update(values).eq("id", id);
  if (error) throw error;
}

export async function archiveSpace(id: string) {
  const { error } = await client().from("spaces").update({ archived: true }).eq("id", id);
  if (error) throw error;
}

export type ReminderChoice = "tonight" | "weekend" | "date" | "nearby";

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
  return null;
}

export async function addReminder(saveId: string, choice: ReminderChoice, date?: string): Promise<void> {
  const kind = choice === "nearby" ? "place" : "time";
  const { error } = await client()
    .from("reminders")
    .insert({ save_id: saveId, kind, fire_at: reminderTime(choice, date) });
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
