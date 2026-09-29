"use client";

import useSWR from "swr";
import type { TimedText, VideoExtras } from "@/lib/types";

/** Chapters, key moments, transcript and what's next, for the video being watched. */
export function useVideoExtras(articleId: string | null) {
  const { data, mutate } = useSWR<VideoExtras>(
    articleId ? `/api/articles/${articleId}/video` : null
  );
  return { extras: data ?? null, mutate };
}

export type VideoAiResult = "done" | "busy" | "failed" | "skipped" | "running";

/** Asks for the summary and transcript now (Gemini watches the video: up to a minute). */
export async function requestVideoAi(articleId: string): Promise<VideoAiResult> {
  const res = await fetch(`/api/articles/${articleId}/video`, { method: "POST" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return "busy";
  return (body.result as VideoAiResult) ?? "failed";
}

export async function saveVideoProgress(articleId: string, seconds: number, percent: number) {
  await fetch(`/api/articles/${articleId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      watchedSeconds: Math.round(seconds),
      readProgress: Math.round(percent),
    }),
  });
}

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** "12 min", "1 h 5 min", for lists. */
export function durationLabel(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * The transcript as part of the article body, so it can be highlighted like text. Each
 * part starts with its time, a link that jumps the player there (data-t).
 */
export function transcriptHtml(videoId: string, transcript: TimedText[]) {
  if (transcript.length === 0) return "";
  const parts = transcript
    .map(
      (part) =>
        `<p><a href="https://www.youtube.com/watch?v=${videoId}&amp;t=${part.t}s" data-t="${part.t}" class="video-time">${clock(part.t)}</a> ${escapeHtml(part.text)}</p>`
    )
    .join("");
  return `<h2>Transcript</h2>${parts}`;
}
