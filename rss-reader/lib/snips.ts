"use client";

import { mutate } from "swr";
import type { HighlightSummary } from "@/lib/types";
import { readPref, usePref } from "@/lib/prefs";

// Snips, the Snipd idea: one tap (or a double press on the earbuds) while an episode plays
// grabs the last half-minute as a note: what was said, a title, where to replay it. They
// are highlights, so they sit in Highlights, come up in the daily review, and export.

export const SNIP_WINDOWS = [30, 60] as const;
const WINDOW_KEY = "snip-window";

export function readSnipWindow(): 30 | 60 {
  const n = Number(readPref<unknown>(WINDOW_KEY, 30));
  return n === 60 ? 60 : 30;
}

export function useSnipWindow() {
  const [raw, set] = usePref<unknown>(WINDOW_KEY, 30);
  return [Number(raw) === 60 ? 60 : 30, (next: 30 | 60) => set(next)] as const;
}

export function clockLabel(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Saves a snip ending at `at` seconds; resolves with the highlight (and whether it had words). */
export async function createSnip(articleId: string, at: number, window = readSnipWindow()) {
  const res = await fetch(`/api/articles/${articleId}/snip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ at: Math.floor(at), window }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    highlight?: HighlightSummary;
    transcript?: boolean;
    error?: string;
  };
  if (!res.ok || !body.highlight) throw new Error(body.error || "Couldn't snip that");
  // The episode's highlights and the Highlights list show it right away.
  void mutate(`/api/highlights?articleId=${articleId}`);
  void mutate((key) => typeof key === "string" && key.includes("/api/highlights?"), undefined, {
    revalidate: true,
  });
  return { highlight: body.highlight, transcript: Boolean(body.transcript) };
}

export function isSnip(highlight: Pick<HighlightSummary, "kind">) {
  return highlight.kind === "snip";
}
