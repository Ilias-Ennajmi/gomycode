"use client";

// Stories: each source's latest unread articles as a full-screen, auto-advancing flow (the
// way social apps show a day). "Seen" lives on the device: it dims a source's ring once all
// of its stories were looked at, without marking anything read.

const KEY = "stories-seen";
const MAX = 600;

export function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function markSeen(id: string) {
  try {
    const list = (JSON.parse(localStorage.getItem(KEY) || "[]") as string[]).filter(
      (x) => x !== id
    );
    list.push(id);
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
    window.dispatchEvent(new CustomEvent("reader:stories-seen"));
  } catch {
    // Not remembered: the ring stays lit.
  }
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
