"use client";

import { readPref, writePref } from "@/lib/prefs";

// Stories: each source's latest unread articles as a full-screen, auto-advancing flow (the
// way social apps show a day). "Seen" is a shared preference: it dims a source's ring once
// all of its stories were looked at, on every device, without marking anything read.

const KEY = "stories-seen";
const MAX = 600;

function list(): string[] {
  const saved = readPref<unknown>(KEY, []);
  return Array.isArray(saved) ? (saved as string[]) : [];
}

export function readSeen(): Set<string> {
  return new Set(list());
}

export function markSeen(id: string) {
  const next = list().filter((x) => x !== id);
  next.push(id);
  writePref(KEY, next.slice(-MAX));
  window.dispatchEvent(new CustomEvent("reader:stories-seen"));
}

export interface StorySource {
  id: string;
  title: string;
  faviconUrl: string | null;
  /** The articles come from this feed, or from For You's pool when "foryou". */
  kind: "feed" | "foryou";
  unread: number;
}

/** Where a source's stories come from. */
export function storiesUrl(source: StorySource) {
  const base = source.kind === "foryou" ? "view=foryou" : `feedId=${source.id}`;
  return `/api/articles?${base}&unread=true&sort=newest&page=1&limit=8`;
}
