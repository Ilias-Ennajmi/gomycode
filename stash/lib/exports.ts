"use client";

import { getBrowserClient } from "@/lib/supabase/client";
import type { Enums, Json } from "@/lib/supabase/types";

export type ExportKind = Enums<"export_kind">;
export type ExportStatus = "queued" | "running" | "ready" | "failed";
export type ExportOptions = { only_applied_kept: boolean; include_quotes: boolean };

export type ExportRow = {
  id: string;
  spaceId: string;
  kind: ExportKind;
  status: ExportStatus;
  error: string | null;
  shareSlug: string | null;
  filePath: string | null;
  files: Record<string, string>;
  createdAt: string;
};

const SELECT = "id,space_id,kind,status,error,share_slug,file_path,files,created_at";

type Row = {
  id: string;
  space_id: string;
  kind: ExportKind;
  status: string;
  error: string | null;
  share_slug: string | null;
  file_path: string | null;
  files: Json;
  created_at: string;
};

const STATUSES: ExportStatus[] = ["queued", "running", "ready", "failed"];

export function toExportRow(r: Row): ExportRow {
  const files: Record<string, string> = {};
  if (r.files && typeof r.files === "object" && !Array.isArray(r.files)) {
    for (const [k, v] of Object.entries(r.files)) if (typeof v === "string") files[k] = v;
  }
  return {
    id: r.id,
    spaceId: r.space_id,
    kind: r.kind,
    status: (STATUSES as string[]).includes(r.status) ? (r.status as ExportStatus) : "queued",
    error: r.error,
    shareSlug: r.share_slug,
    filePath: r.file_path,
    files,
    createdAt: r.created_at,
  };
}

function client() {
  const supabase = getBrowserClient();
  if (!supabase) throw new Error("Supabase isn't configured");
  return supabase;
}

/** Inserting the row queues the worker job (a collection link is ready at once). */
export async function createExport(spaceId: string, kind: ExportKind, options: ExportOptions): Promise<ExportRow> {
  const { data, error } = await client()
    .from("exports")
    .insert({ space_id: spaceId, kind, options })
    .select(SELECT)
    .single();
  if (error) throw error;
  return toExportRow(data as Row);
}

export async function fetchExport(id: string): Promise<ExportRow | null> {
  const { data } = await client().from("exports").select(SELECT).eq("id", id).maybeSingle();
  return data ? toExportRow(data as Row) : null;
}

/** The newest live collection link of a Space, if there is one. */
export async function latestCollection(spaceId: string): Promise<ExportRow | null> {
  const { data } = await client()
    .from("exports")
    .select(SELECT)
    .eq("space_id", spaceId)
    .eq("kind", "collection")
    .not("share_slug", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? toExportRow(data as Row) : null;
}

export async function deleteExport(id: string): Promise<void> {
  const { error } = await client().from("exports").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Follows one export until it is ready or failed: Realtime first, with a slow
 * poll as a safety net (Realtime can drop on a phone that sleeps).
 */
export function watchExport(id: string, onChange: (row: ExportRow) => void): () => void {
  const supabase = getBrowserClient();
  if (!supabase) return () => {};
  let done = false;
  const handle = (row: ExportRow) => {
    if (done) return;
    onChange(row);
    if (row.status === "ready" || row.status === "failed") stop();
  };
  const channel = supabase
    .channel(`stash-export-${id}-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "UPDATE", schema: "stash", table: "exports", filter: `id=eq.${id}` }, (payload) =>
      handle(toExportRow(payload.new as Row)),
    )
    .subscribe();
  const timer = setInterval(() => {
    void fetchExport(id).then((row) => row && handle(row));
  }, 5000);
  function stop() {
    done = true;
    clearInterval(timer);
    void supabase?.removeChannel(channel);
  }
  return stop;
}

export function collectionUrl(slug: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/c/${slug}`;
}

export const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** A file name people recognise in the share sheet: "Cafe launch brief.pdf". */
export function exportFileName(spaceName: string, kind: ExportKind, ext: string): string {
  const base = spaceName.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, " ").slice(0, 40) || "Stash";
  const label = kind === "brief" ? "brief" : kind === "moodboard" ? "moodboard" : kind === "deck" ? "deck" : "collection";
  return `${base} ${label}.${ext}`;
}

/** Downloads the finished file through the app's owner-checked route. */
export async function fetchExportFile(id: string, ext: string, fileName: string): Promise<File> {
  const r = await fetch(`/api/exports/${id}?ext=${encodeURIComponent(ext)}`);
  if (!r.ok) throw new Error(`export link ${r.status}`);
  const { url } = (await r.json()) as { url: string };
  const blob = await (await fetch(url)).blob();
  return new File([blob], fileName, { type: EXT_MIME[ext] ?? blob.type });
}

/** Android share sheet with the file; a plain download where files can't be shared. */
export async function shareOrDownload(file: File): Promise<"shared" | "downloaded" | "cancelled"> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: file.name });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled";
      // NotAllowedError (no user gesture left) and others: fall through to a download.
    }
  }
  const href = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = href;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 30_000);
  return "downloaded";
}

export type Synthesis = { topic: string | null; points: string[]; action: string | null; count: number; createdAt: string };

function pointText(p: Json): string | null {
  if (typeof p === "string") return p;
  if (p && typeof p === "object" && !Array.isArray(p)) {
    for (const key of ["text", "point", "summary", "claim"]) {
      const v = (p as Record<string, Json | undefined>)[key];
      if (typeof v === "string" && v.trim()) return v;
    }
  }
  return null;
}

/** The newest synthesis written for a Space (Phase 2 writes them; this only reads). */
export async function latestSynthesis(spaceId: string): Promise<Synthesis | null> {
  const supabase = getBrowserClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("syntheses")
    .select("topic,points,suggested_action,source_save_ids,created_at")
    .eq("space_id", spaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const points = (Array.isArray(data.points) ? data.points : []).map(pointText).filter((x): x is string => Boolean(x));
  return {
    topic: data.topic,
    points,
    action: data.suggested_action,
    count: data.source_save_ids?.length ?? 0,
    createdAt: data.created_at,
  };
}
