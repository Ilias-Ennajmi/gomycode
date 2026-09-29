"use client";

import * as React from "react";
import useSWR from "swr";
import { Highlighter } from "lucide-react";
import { cn } from "@/lib/utils";
import { HIGHLIGHT_SWATCH } from "@/components/highlights/ReaderHighlights";
import { requestHighlightJump } from "@/lib/highlight-dom";
import type { HighlightSummary } from "@/lib/types";

/** Today: three older highlights to read again, so what you kept comes back to you. */
export function ResurfacedHighlights({
  onOpen,
  title,
}: {
  onOpen: (articleId: string) => void;
  /** Renders the section heading (Today has its own style). */
  title: (children: React.ReactNode) => React.ReactNode;
}) {
  const { data } = useSWR<{ highlights: HighlightSummary[] }>("/api/highlights/resurface", {
    revalidateOnFocus: false,
  });
  const highlights = data?.highlights ?? [];
  if (highlights.length === 0) return null;

  return (
    <section>
      {title(
        <>
          <Highlighter className="h-5 w-5 text-primary" /> From your highlights
        </>
      )}
      <ul className="mt-3 space-y-4">
        {highlights.map((h) => (
          <li key={h.id}>
            <button
              type="button"
              onClick={() => {
                requestHighlightJump(h.id);
                onOpen(h.articleId);
              }}
              className="flex w-full gap-3 text-left"
            >
              <span
                className={cn("w-1 shrink-0 rounded-full", HIGHLIGHT_SWATCH[h.color])}
                aria-hidden
              />
              <span className="min-w-0">
                <span className="line-clamp-5 font-serif text-lg leading-relaxed">{h.text}</span>
                {h.note && (
                  <span className="mt-1 block text-sm text-muted-foreground">{h.note}</span>
                )}
                {h.article && (
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {h.article.title} · {h.article.feed.title}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
