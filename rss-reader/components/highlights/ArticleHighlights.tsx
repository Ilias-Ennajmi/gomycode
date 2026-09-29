"use client";

import * as React from "react";
import { Highlighter } from "lucide-react";
import { cn } from "@/lib/utils";
import { HIGHLIGHT_SWATCH } from "@/components/highlights/ReaderHighlights";
import type { HighlightSummary } from "@/lib/types";

/**
 * "Your highlights" under the article: every passage and note, including ones that aren't
 * in the version of the text on screen (the feed version vs the full article).
 */
export function ArticleHighlights({
  highlights,
  missing,
  bodyRef,
}: {
  highlights: HighlightSummary[];
  missing: string[];
  bodyRef: React.MutableRefObject<HTMLDivElement | null>;
}) {
  if (highlights.length === 0) return null;

  function jumpTo(id: string) {
    const mark = bodyRef.current?.querySelector<HTMLElement>(`mark[data-hl="${id}"]`);
    if (!mark) return;
    mark.scrollIntoView({ behavior: "smooth", block: "center" });
    const marks = bodyRef.current!.querySelectorAll(`mark[data-hl="${id}"]`);
    marks.forEach((m) => m.classList.add("reader-highlight-flash"));
    setTimeout(() => marks.forEach((m) => m.classList.remove("reader-highlight-flash")), 1600);
  }

  return (
    <section aria-label="Your highlights" className="mt-10 rounded-2xl border bg-card/60 p-4">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Highlighter className="h-3.5 w-3.5" /> Your highlights · {highlights.length}
      </h2>
      <ul className="space-y-3">
        {highlights.map((h) => {
          const absent = missing.includes(h.id);
          return (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => jumpTo(h.id)}
                disabled={absent}
                className="flex w-full gap-3 text-left disabled:cursor-default"
              >
                <span
                  className={cn("w-1 shrink-0 rounded-full", HIGHLIGHT_SWATCH[h.color])}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="line-clamp-4 text-[15px] leading-relaxed">{h.text}</span>
                  {h.note && (
                    <span className="mt-1 block whitespace-pre-line text-sm text-muted-foreground">
                      {h.note}
                    </span>
                  )}
                  {absent && (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      From the other version of this article
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
