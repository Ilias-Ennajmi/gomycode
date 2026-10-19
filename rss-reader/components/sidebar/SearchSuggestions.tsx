"use client";

import * as React from "react";
import useSWR from "swr";
import { Clock, Hash, Rss, Search, Sparkles } from "lucide-react";
import { useFeeds } from "@/lib/hooks/useFeeds";

const RECENTS_KEY = "search-recents";
const MAX_RECENTS = 8;

export function readRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** Remembers a search that was run, newest first, without duplicates. */
export function rememberSearch(query: string) {
  const q = query.trim();
  if (!q) return;
  try {
    const next = [q, ...readRecents().filter((r) => r !== q)].slice(0, MAX_RECENTS);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // Not remembered: fine.
  }
}

function fold(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** The last word being typed, to match sources and tags against. */
function lastWord(draft: string) {
  return draft.split(/\s+/).pop() ?? "";
}

interface Suggestion {
  key: string;
  icon: React.ReactNode;
  label: string;
  /** What goes in the box when picked. */
  query: string;
  hint?: string;
}

/**
 * Under the search box while it has focus: recent searches when it's empty, and as you
 * type, sources ("from:") and tags ("tag:") that match, plus the operators to know about.
 */
export function SearchSuggestions({
  draft,
  onPick,
}: {
  draft: string;
  onPick: (query: string, run: boolean) => void;
}) {
  const { feeds } = useFeeds();
  const { data: tagData } = useSWR<{ tags: { tag: string; count: number }[] }>(
    "/api/highlights/tags",
    { revalidateOnFocus: false }
  );
  const [recents, setRecents] = React.useState<string[]>([]);
  React.useEffect(() => setRecents(readRecents()), [draft]);

  const trimmed = draft.trim();
  const word = fold(lastWord(trimmed));
  const suggestions: Suggestion[] = [];
  if (!trimmed) {
    recents.forEach((r) =>
      suggestions.push({
        key: `r:${r}`,
        icon: <Clock className="h-3.5 w-3.5" />,
        label: r,
        query: r,
      })
    );
  } else if (word.length >= 2 && !/^(from|tag|is|in):/.test(word)) {
    // Replace the word being typed with the operator form.
    const head = trimmed.slice(0, trimmed.length - lastWord(trimmed).length);
    feeds
      .filter((feed) => fold(feed.title).includes(word))
      .slice(0, 3)
      .forEach((feed) =>
        suggestions.push({
          key: `f:${feed.id}`,
          icon: <Rss className="h-3.5 w-3.5" />,
          label: feed.title,
          hint: "only this source",
          query: `${head}from:"${feed.title}" `,
        })
      );
    (tagData?.tags ?? [])
      .filter((t) => t.tag.includes(word))
      .slice(0, 3)
      .forEach((t) =>
        suggestions.push({
          key: `t:${t.tag}`,
          icon: <Hash className="h-3.5 w-3.5" />,
          label: `#${t.tag}`,
          hint: "highlights with this tag",
          query: `${head}tag:${t.tag} `,
        })
      );
  }

  if (suggestions.length === 0 && trimmed) {
    return (
      <Hints>
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3" /> Try <code>from:verge</code>, <code>tag:ai</code>,{" "}
          <code>is:unread</code>, <code>is:saved</code>, <code>in:youtube</code>
        </span>
      </Hints>
    );
  }
  if (suggestions.length === 0) return null;

  return (
    <div
      role="listbox"
      aria-label="Search suggestions"
      className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl animate-fade-in"
      // Keep the input focused while picking.
      onMouseDown={(event) => event.preventDefault()}
    >
      {!trimmed && (
        <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Recent
        </p>
      )}
      <ul>
        {suggestions.map((s) => (
          <li key={s.key}>
            <button
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => onPick(s.query, !trimmed)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <span className="text-muted-foreground">{s.icon}</span>
              <span className="min-w-0 flex-1 truncate">{s.label}</span>
              {s.hint && (
                <span className="shrink-0 text-[11px] text-muted-foreground">{s.hint}</span>
              )}
              {!trimmed && <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            </button>
          </li>
        ))}
      </ul>
      {!trimmed && (
        <Hints>
          <span>
            Narrow with <code>from:</code>, <code>tag:</code>, <code>is:unread</code>,{" "}
            <code>in:news</code>
          </span>
        </Hints>
      )}
    </div>
  );
}

function Hints({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-x-0 top-full z-30 mt-1 rounded-xl border bg-popover px-3 py-2 text-[11px] text-muted-foreground shadow-xl [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[10.5px]">
      {children}
    </div>
  );
}
