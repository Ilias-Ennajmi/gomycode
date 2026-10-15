"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { updateHighlight } from "@/lib/hooks/useHighlights";
import type { HighlightSummary } from "@/lib/types";

/** A highlight's tags as chips: tap + to add one, × to remove it. */
export function TagEditor({ highlight }: { highlight: HighlightSummary }) {
  const [tags, setTags] = React.useState(highlight.tags ?? []);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  React.useEffect(() => setTags(highlight.tags ?? []), [highlight.tags]);

  async function save(next: string[]) {
    const previous = tags;
    setTags(next);
    try {
      const saved = await updateHighlight(highlight.id, { tags: next });
      setTags(saved.tags ?? next);
    } catch (error) {
      setTags(previous);
      toast.error(error instanceof Error ? error.message : "Could not save the tag");
    }
  }

  function add() {
    const fresh = draft
      .split(",")
      .map((t) => t.trim().toLowerCase().replace(/^#/, ""))
      .filter((t) => t && !tags.includes(t));
    setDraft("");
    setAdding(false);
    if (fresh.length) void save([...tags, ...fresh]);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex h-6 items-center gap-0.5 rounded-full bg-primary/10 pl-2 pr-0.5 text-xs font-medium text-primary"
        >
          #{tag}
          <button
            type="button"
            onClick={() => void save(tags.filter((t) => t !== tag))}
            className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-primary/20"
            aria-label={`Remove tag ${tag}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {adding ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={add}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setDraft("");
                setAdding(false);
              }
            }}
            placeholder="tag"
            aria-label="New tag"
            enterKeyHint="done"
            className="h-6 w-28 rounded-full border bg-background px-2 text-base outline-none focus-visible:border-primary sm:text-xs"
          />
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex h-6 items-center gap-0.5 rounded-full border border-dashed px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-3 w-3" /> Tag
        </button>
      )}
    </div>
  );
}
