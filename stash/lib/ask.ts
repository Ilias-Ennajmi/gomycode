"use client";

import { getBrowserClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";
import type { AskRow } from "@/lib/askState";

/* Client calls for "Ask your saves". Every call runs as the owner (RLS). */

const SELECT = "id,question,status,answer,cited_save_ids,error,created_at";
type Row = Pick<Tables<"asks">, "id" | "question" | "status" | "answer" | "cited_save_ids" | "error" | "created_at">;

export const toAsk = (r: Row): AskRow => ({
  id: r.id,
  question: r.question,
  status: r.status,
  answer: r.answer,
  citedSaveIds: Array.isArray(r.cited_save_ids) ? r.cited_save_ids : [],
  error: r.error,
  createdAt: r.created_at,
});

/** Inserts the question. Throws an object with `code` ("54000" = daily limit). */
export async function createAsk(question: string): Promise<AskRow> {
  const supabase = getBrowserClient();
  if (!supabase) throw { code: "unconfigured" };
  const { data, error } = await supabase.from("asks").insert({ question }).select(SELECT).single();
  if (error) throw { code: error.code };
  return toAsk(data);
}

export async function fetchAsk(id: string): Promise<AskRow | null> {
  const supabase = getBrowserClient();
  if (!supabase) return null;
  const { data } = await supabase.from("asks").select(SELECT).eq("id", id).maybeSingle();
  return data ? toAsk(data) : null;
}

export async function fetchRecentAsks(limit = 6): Promise<AskRow[]> {
  const supabase = getBrowserClient();
  if (!supabase) return [];
  const { data } = await supabase.from("asks").select(SELECT).order("created_at", { ascending: false }).limit(limit);
  return (data ?? []).map(toAsk);
}

export async function deleteAsk(id: string): Promise<void> {
  await getBrowserClient()?.from("asks").delete().eq("id", id);
}

/**
 * Follows one ask until it is ready or failed: Realtime, with a poll as the fallback
 * (a phone that just woke up may have missed the event). Returns a stop function.
 */
export function watchAsk(id: string, onRow: (row: AskRow) => void, onTimeout: () => void, timeoutMs = 90_000): () => void {
  const supabase = getBrowserClient();
  if (!supabase) return () => {};
  let stopped = false;
  const done = (row: AskRow) => row.status === "ready" || row.status === "failed";
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(poll);
    clearTimeout(limit);
    void supabase.removeChannel(channel);
  };
  const deliver = (row: AskRow) => {
    if (stopped) return;
    onRow(row);
    if (done(row)) stop();
  };
  const channel = supabase
    .channel(`stash-ask-${id}-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "UPDATE", schema: "stash", table: "asks", filter: `id=eq.${id}` }, (payload) => deliver(toAsk(payload.new as Row)))
    .subscribe();
  const poll = setInterval(() => {
    void fetchAsk(id).then((row) => row && deliver(row));
  }, 2500);
  const limit = setTimeout(() => {
    if (stopped) return;
    stop();
    onTimeout();
  }, timeoutMs);
  return stop;
}
