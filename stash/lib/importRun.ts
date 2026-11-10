"use client";

import { getBrowserClient } from "@/lib/supabase/client";
import { detectPlatform } from "@/lib/links";
import { enqueueMany, flush, pending, type OutboxItem } from "@/lib/outbox";
import type { ImportedLink, ImportSource } from "@/lib/importers";

/** Every saved link already on the server or waiting in the outbox (for de-duplication). */
export async function existingUrls(): Promise<string[]> {
  const urls = (await pending()).map((p) => p.sourceUrl);
  const supabase = getBrowserClient();
  if (!supabase) return urls;
  const PAGE = 1000;
  for (let from = 0; from < 50_000; from += PAGE) {
    const { data, error } = await supabase.from("saves").select("source_url").range(from, from + PAGE - 1);
    if (error) throw error;
    urls.push(...(data ?? []).map((r) => r.source_url));
    if (!data || data.length < PAGE) break;
  }
  return urls;
}

const BATCH = 100;

/**
 * Puts the links in the outbox (local first, so nothing is lost if the phone
 * goes offline), then sends them. `onProgress(sent, total)` follows the upload.
 */
export async function queueLinks(links: ImportedLink[], onProgress: (sent: number, total: number) => void): Promise<number> {
  const now = new Date().toISOString();
  const items: OutboxItem[] = links.map((l) => ({
    clientId: crypto.randomUUID(),
    sourceUrl: l.url,
    platform: detectPlatform(l.url),
    spaceId: null,
    sharedTitle: null,
    savedAt: l.savedAt ?? now,
  }));
  const ids = new Set(items.map((i) => i.clientId));
  for (let i = 0; i < items.length; i += BATCH) await enqueueMany(items.slice(i, i + BATCH));
  onProgress(0, items.length);

  const left = async () => (await pending()).filter((p) => ids.has(p.clientId)).length;
  // flush() sends in batches; poll the outbox between rounds for the progress bar.
  for (let round = 0; round < 3; round++) {
    const flushing = flush();
    const timer = setInterval(() => void left().then((n) => onProgress(items.length - n, items.length)), 500);
    await flushing;
    clearInterval(timer);
    const n = await left();
    onProgress(items.length - n, items.length);
    if (n === 0) break;
  }
  return items.length - (await left());
}

export async function recordImport(source: ImportSource, fileName: string, total: number, queued: number): Promise<void> {
  const supabase = getBrowserClient();
  if (!supabase) return;
  await supabase.from("imports").insert({ source, file_name: fileName.slice(0, 200), total, queued });
}

export type ImportRecord = { id: string; source: ImportSource; fileName: string | null; total: number; queued: number; createdAt: string };

export async function importHistory(): Promise<ImportRecord[]> {
  const supabase = getBrowserClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("imports")
    .select("id,source,file_name,total,queued,created_at")
    .order("created_at", { ascending: false })
    .limit(10);
  return (data ?? []).map((r) => ({
    id: r.id,
    source: r.source === "tiktok" ? "tiktok" : "instagram",
    fileName: r.file_name,
    total: r.total,
    queued: r.queued,
    createdAt: r.created_at,
  }));
}
