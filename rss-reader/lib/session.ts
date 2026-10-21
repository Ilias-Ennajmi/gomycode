"use client";

import * as React from "react";
import type { ArticleSummary } from "@/lib/types";

// A reading session: a short pile picked to fit some minutes ("Got 5 minutes?"), read one
// after another in the reader. While it's on, the reader's previous / next and swipes go
// through the pile instead of the list, the reader shows where you are in it, and leaving
// the reader keeps it: a pill brings you back to the piece you were on.

export interface ReadingSession {
  /** "Your 5 minutes". */
  title: string;
  minutes: number;
  items: ArticleSummary[];
  /** The piece open now (or last open). */
  index: number;
  /** Pieces opened at least once. */
  seen: string[];
}

let session: ReadingSession | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function startSession(next: Omit<ReadingSession, "seen">) {
  session = { ...next, seen: [next.items[next.index]?.id].filter(Boolean) as string[] };
  emit();
}

export function endSession() {
  session = null;
  emit();
}

/** Marks the piece open now, when it's one of the session's. */
export function sessionAt(articleId: string) {
  if (!session) return;
  const index = session.items.findIndex((a) => a.id === articleId);
  if (index < 0 || (index === session.index && session.seen.includes(articleId))) return;
  session = {
    ...session,
    index,
    seen: session.seen.includes(articleId) ? session.seen : [...session.seen, articleId],
  };
  emit();
}

export function useSession() {
  return React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => session,
    () => null
  );
}

/** Minutes left in a piece: the rest of an episode or video, the unread part of an article. */
export function minutesLeft(article: ArticleSummary) {
  if (article.isVideo || article.audioUrl) {
    if (!article.durationSeconds) return null;
    return Math.max(1, (article.durationSeconds - (article.watchedSeconds ?? 0)) / 60);
  }
  const minutes = article.readingMinutes ?? 3;
  return Math.max(1, minutes * (1 - (article.readProgress ?? 0) / 100));
}

/** The pieces that fit the budget, greedily in the order given. */
export function fillBudget(candidates: ArticleSummary[], budget: number) {
  const picks: { article: ArticleSummary; minutes: number }[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const article of candidates) {
    if (seen.has(article.id) || article.isShort) continue;
    seen.add(article.id);
    const minutes = minutesLeft(article);
    if (minutes === null || total + minutes > budget + 0.5) continue;
    picks.push({ article, minutes });
    total += minutes;
    if (budget - total < 1) break;
  }
  return { picks, total };
}
