"use client";

import { useCallback, useEffect, useState } from "react";
import { GraduationCap, Highlighter, X } from "lucide-react";
import { AiLabel } from "@/components/ui/AiLabel";
import { IconButton } from "@/components/ui/IconButton";
import { formatDuration } from "@/components/ui/Thumbnail";
import { useToast } from "@/components/ui/Toast";
import { haptic } from "@/lib/haptics";
import { addHighlight, fetchHighlights, makeCard, onHighlightsChange, removeHighlight } from "@/lib/highlights";
import { highlightText, sameLine, type Highlight } from "@/lib/highlightText";

export type Line = { text: string; start?: number | null; end?: number | null };

/**
 * A save's highlights: optimistic add / remove / "make a recall card", live when the
 * worker adds its own. `onKept` tells the page the save is now kept (recall asks about kept saves).
 */
export function useHighlights(saveId: string, title: string | null, onKept?: () => void) {
  const { toast } = useToast();
  const [list, setList] = useState<Highlight[]>([]);

  const load = useCallback(() => {
    void fetchHighlights({ saveId })
      .then((rows) => setList((prev) => [...prev.filter((h) => h.id.startsWith("tmp-")), ...rows]))
      .catch(() => {});
  }, [saveId]);

  useEffect(() => {
    load();
    return onHighlightsChange(load, saveId);
  }, [load, saveId]);

  const card = useCallback(
    (h: Highlight) => {
      if (h.cardId || h.id.startsWith("tmp-")) return;
      haptic();
      setList((prev) => prev.map((x) => (x.id === h.id ? { ...x, cardId: "pending" } : x)));
      onKept?.();
      toast({ message: "Recall card added · this save is kept" });
      makeCard(h, title)
        .then((cardId) => setList((prev) => prev.map((x) => (x.id === h.id ? { ...x, cardId } : x))))
        .catch(() => {
          setList((prev) => prev.map((x) => (x.id === h.id ? { ...x, cardId: null } : x)));
          toast({ message: "Couldn't make the card. Check your connection." });
        });
    },
    [title, toast, onKept],
  );

  const remove = useCallback(
    (h: Highlight) => {
      setList((prev) => prev.filter((x) => x.id !== h.id));
      if (h.id.startsWith("tmp-")) return;
      removeHighlight(h.id).catch(() => {
        setList((prev) => [h, ...prev]);
        toast({ message: "Couldn't remove it. Check your connection." });
      });
    },
    [toast],
  );

  /** Tap a line: keep it, or let it go if it is already kept. */
  const toggle = useCallback(
    (line: Line) => {
      const text = highlightText(line.text);
      if (!text) return;
      const existing = list.find((h) => sameLine(h, line));
      if (existing) {
        remove(existing);
        return;
      }
      haptic();
      const tmp: Highlight = {
        id: `tmp-${Math.random().toString(36).slice(2)}`,
        saveId,
        text,
        start: line.start ?? null,
        end: line.end ?? null,
        cardId: null,
        source: "user",
        createdAt: new Date().toISOString(),
      };
      setList((prev) => [tmp, ...prev]);
      addHighlight(saveId, line)
        .then((saved) => {
          setList((prev) => prev.map((x) => (x.id === tmp.id ? saved : x)));
          toast({ message: "Highlight saved", actionLabel: "Make a card", onAction: () => card(saved) });
        })
        .catch(() => {
          setList((prev) => prev.filter((x) => x.id !== tmp.id));
          toast({ message: "Couldn't save the highlight. Check your connection." });
        });
    },
    [list, saveId, remove, card, toast],
  );

  const isOn = useCallback((line: Line) => list.some((h) => sameLine(h, line)), [list]);

  return { list, toggle, remove, card, isOn };
}

/** The Highlights block: each kept line, where it is in the video, and "Make a recall card". */
export function HighlightList({
  highlights,
  onSeek,
  onCard,
  onRemove,
  saveTitle,
  onOpen,
}: {
  highlights: Highlight[];
  /** Jump the player to the line (item page, stored video only). */
  onSeek?: (seconds: number) => void;
  onCard: (h: Highlight) => void;
  onRemove?: (h: Highlight) => void;
  /** Learn: the save each highlight is from, and a way to open it. */
  saveTitle?: (h: Highlight) => string | undefined;
  onOpen?: (h: Highlight) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {highlights.map((h) => {
        const from = saveTitle?.(h);
        return (
          <li key={h.id} className="flex flex-col gap-2 rounded-lg bg-surface p-4 shadow-pop">
            {h.source === "ai" && <AiLabel text="Picked this line" />}
            <div className="flex items-start gap-3">
              <Highlighter size={20} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0 text-fg-muted" />
              <blockquote className="min-w-0 flex-1 text-body text-fg">{h.text}</blockquote>
              {onRemove && <IconButton label="Remove highlight" icon={X} className="-mr-2 -mt-2" onClick={() => onRemove(h)} />}
            </div>
            <div className="flex flex-wrap items-center gap-2 pl-8">
              {from && onOpen && (
                <button type="button" onClick={() => onOpen(h)} className="press flex min-h-12 min-w-0 basis-full items-center text-left text-caption text-fg-muted underline">
                  <span className="line-clamp-2">
                    {from}
                    {h.start !== null ? ` · ${formatDuration(h.start)}` : ""}
                  </span>
                </button>
              )}
              {!from && h.start !== null && (
                <button
                  type="button"
                  disabled={!onSeek}
                  onClick={() => onSeek?.(h.start as number)}
                  aria-label={`Play from ${formatDuration(h.start)}`}
                  className="press flex h-12 items-center rounded-full bg-raised px-4 text-caption tabular-nums text-fg disabled:opacity-60"
                >
                  {formatDuration(h.start)}
                </button>
              )}
              {h.cardId ? (
                <span className="ml-auto flex h-12 items-center gap-2 px-2 text-caption text-fg-muted">
                  <GraduationCap size={20} strokeWidth={2} aria-hidden /> In recall
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onCard(h)}
                  disabled={h.id.startsWith("tmp-")}
                  className="press ml-auto flex h-12 items-center gap-2 rounded-full border border-line bg-raised px-4 text-label text-fg disabled:opacity-60"
                >
                  <GraduationCap size={20} strokeWidth={2} aria-hidden /> Make a recall card
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
