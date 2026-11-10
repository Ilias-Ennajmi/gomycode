"use client";

import { getBrowserClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";
import { cardFromHighlight, highlightText, type Highlight } from "@/lib/highlightText";

/* Highlights: lines kept from a transcript or an article. Every call runs as the owner (RLS). */

const SELECT = "id,save_id,text,start_s,end_s,card_id,source,created_at";
type Row = Pick<Tables<"highlights">, "id" | "save_id" | "text" | "start_s" | "end_s" | "card_id" | "source" | "created_at">;

const toHighlight = (r: Row): Highlight => ({
  id: r.id,
  saveId: r.save_id,
  text: r.text,
  start: r.start_s === null ? null : Number(r.start_s),
  end: r.end_s === null ? null : Number(r.end_s),
  cardId: r.card_id,
  source: r.source,
  createdAt: r.created_at,
});

function client() {
  const supabase = getBrowserClient();
  if (!supabase) throw new Error("Supabase isn't configured");
  return supabase;
}

export async function fetchHighlights(opts: { saveId?: string; limit?: number } = {}): Promise<Highlight[]> {
  let q = client().from("highlights").select(SELECT).order("created_at", { ascending: false }).limit(opts.limit ?? 200);
  if (opts.saveId) q = q.eq("save_id", opts.saveId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(toHighlight);
}

export async function addHighlight(saveId: string, line: { text: string; start?: number | null; end?: number | null }): Promise<Highlight> {
  const text = highlightText(line.text);
  if (!text) throw new Error("empty highlight");
  const { data, error } = await client()
    .from("highlights")
    .insert({ save_id: saveId, text, start_s: line.start ?? null, end_s: line.end ?? null, source: "user" })
    .select(SELECT)
    .single();
  if (error) throw error;
  return toHighlight(data);
}

export async function removeHighlight(id: string): Promise<void> {
  const { error } = await client().from("highlights").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Turns a highlight into a recall card. Recall only asks about kept saves, so the save
 * is kept too. Returns the card id.
 */
export async function makeCard(h: Highlight, title?: string | null): Promise<string> {
  const supabase = client();
  const { prompt, answer } = cardFromHighlight(h.text, title);
  const { data, error } = await supabase.from("cards").insert({ save_id: h.saveId, prompt, answer }).select("id").single();
  if (error) throw error;
  const [{ error: linkError }] = await Promise.all([
    supabase.from("highlights").update({ card_id: data.id }).eq("id", h.id),
    supabase.from("states").update({ kept: true }).eq("save_id", h.saveId),
  ]);
  if (linkError) throw linkError;
  return data.id;
}

/** Calls back when highlights change (another device, or the worker adding AI highlights). */
export function onHighlightsChange(listener: () => void, saveId?: string): () => void {
  const supabase = getBrowserClient();
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`stash-highlights-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "stash", table: "highlights", ...(saveId ? { filter: `save_id=eq.${saveId}` } : {}) }, listener)
    .subscribe();
  return () => void supabase.removeChannel(channel);
}
