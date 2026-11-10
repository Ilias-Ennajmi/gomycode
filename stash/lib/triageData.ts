"use client";

import { getBrowserClient } from "@/lib/supabase/client";
import { TRIAGE_DEFAULT_LIMIT } from "@/lib/triage";

export async function fetchTriageSeen(): Promise<Record<string, string>> {
  const supabase = getBrowserClient();
  if (!supabase) return {};
  const { data } = await supabase.from("states").select("save_id,triage_seen_at").not("triage_seen_at", "is", null).limit(5000);
  return Object.fromEntries((data ?? []).filter((r) => r.triage_seen_at).map((r) => [r.save_id, r.triage_seen_at as string]));
}

export async function fetchTriageLimit(): Promise<number> {
  const supabase = getBrowserClient();
  if (!supabase) return TRIAGE_DEFAULT_LIMIT;
  const { data } = await supabase.from("settings").select("triage_daily_limit").maybeSingle();
  return typeof data?.triage_daily_limit === "number" ? data.triage_daily_limit : TRIAGE_DEFAULT_LIMIT;
}

/** The AI's Space suggestion per save (insights.suggested_space_id). */
export async function fetchSuggestions(saveIds: string[]): Promise<Record<string, string>> {
  const supabase = getBrowserClient();
  if (!supabase || !saveIds.length) return {};
  const { data } = await supabase.from("insights").select("save_id,suggested_space_id").in("save_id", saveIds.slice(0, 200));
  return Object.fromEntries((data ?? []).filter((r) => r.suggested_space_id).map((r) => [r.save_id, r.suggested_space_id as string]));
}

type Decision = { archived_at?: string | null; kept?: boolean; triage_seen_at: string | null };

export async function decide(saveId: string, values: Decision): Promise<void> {
  const supabase = getBrowserClient();
  if (!supabase) throw new Error("offline");
  const { error } = await supabase.from("states").update(values).eq("save_id", saveId);
  if (error) throw error;
}
