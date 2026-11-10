"use client";

import { getBrowserClient } from "@/lib/supabase/client";
import type { SaveItem } from "@/lib/data";

/*
 * Search (contract 0007 §6). Words first: `search_saves` answers at once. In parallel
 * the query is embedded by the Edge Function `stash-embed` (384 numbers, no key) and
 * `search_saves` runs again with the vector, so "that reel about luxury pricing" finds
 * saves that never use those words. If the function fails, is rate limited or the phone
 * is offline, the words-only answer stands; with no network at all, the saves already
 * on the phone are searched.
 */

export type Hit = { saveId: string; snippet: string | null; start: number | null };
type Row = { save_id: string; snippet: string | null; snippet_start: number | null; score?: number };

export const EMBED_DIMS = 384;

const toHit = (r: Row): Hit => ({ saveId: r.save_id, snippet: r.snippet, start: r.snippet_start });

/** pgvector's text form. Null unless it is exactly 384 finite numbers. */
export function vectorLiteral(v: unknown): string | null {
  if (!Array.isArray(v) || v.length !== EMBED_DIMS || !v.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  return `[${v.join(",")}]`;
}

/** Word matches keep their order and snippets; meaning-only matches follow. */
export function mergeHits(words: Hit[], meaning: Hit[]): Hit[] {
  const seen = new Map<string, Hit>();
  for (const h of words) if (!seen.has(h.saveId)) seen.set(h.saveId, h);
  for (const h of meaning) {
    const had = seen.get(h.saveId);
    if (!had) seen.set(h.saveId, h);
    else if (!had.snippet && h.snippet) seen.set(h.saveId, { ...had, snippet: h.snippet, start: h.start });
  }
  return [...seen.values()];
}

/** Offline: the saves on the phone (titles, key ideas, captions, tags, creators). */
export function localSearch(saves: SaveItem[], q: string, spaceId?: string | null): Hit[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return saves
    .filter((s) => !spaceId || s.spaceId === spaceId)
    .filter((s) => {
      const hay = [s.keyIdea, s.aiTitle, s.caption, s.title, s.creator, ...s.tags, ...s.takeaways].filter(Boolean).join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .map((s) => ({ saveId: s.id, snippet: null, start: null }));
}

export type SearchResult = { hits: Hit[]; byMeaning: boolean; offline: boolean };

async function embedQuery(q: string): Promise<string | null> {
  const supabase = getBrowserClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.functions.invoke("stash-embed", { body: { input: q.slice(0, 1000) } });
    if (error) return null; // 429, not deployed, offline: words only
    const first = (data as { embeddings?: unknown[] } | null)?.embeddings?.[0];
    return vectorLiteral(first);
  } catch {
    return null;
  }
}

/**
 * Runs the search. `onWords` is called as soon as the word matches are in, so the
 * list can show while the meaning matches are still on their way.
 */
export async function searchSaves(
  query: string,
  opts: { spaceId?: string | null; saves?: SaveItem[]; onWords?: (hits: Hit[]) => void; limit?: number } = {},
): Promise<SearchResult> {
  const q = query.trim().slice(0, 200);
  if (!q) return { hits: [], byMeaning: false, offline: false };
  const local = () => ({ hits: localSearch(opts.saves ?? [], q, opts.spaceId), byMeaning: false, offline: true });
  const supabase = getBrowserClient();
  if (!supabase || (typeof navigator !== "undefined" && !navigator.onLine)) return local();

  const base = { p_query: q, p_space_id: opts.spaceId ?? null, p_limit: opts.limit ?? 40 };
  const embedding = embedQuery(q);
  let words: Hit[];
  try {
    const { data, error } = await supabase.rpc("search_saves", { ...base, p_embedding: null });
    if (error) throw error;
    words = (data ?? []).map(toHit);
  } catch {
    return local();
  }
  opts.onWords?.(words);

  const vector = await embedding;
  if (!vector) return { hits: words, byMeaning: false, offline: false };
  try {
    const { data, error } = await supabase.rpc("search_saves", { ...base, p_embedding: vector });
    if (error) throw error;
    return { hits: mergeHits(words, (data ?? []).map(toHit)), byMeaning: true, offline: false };
  } catch {
    return { hits: words, byMeaning: false, offline: false };
  }
}
