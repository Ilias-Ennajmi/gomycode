"use client";

import * as React from "react";
import { Copy, Highlighter, MessageSquarePlus, Share2, StickyNote, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { readSelection, type SelectionQuote } from "@/lib/highlight-dom";
import { createHighlight, deleteHighlight, updateHighlight } from "@/lib/hooks/useHighlights";
import { useBackToClose } from "@/lib/hooks/useHistorySync";
import { haptic } from "@/lib/native";
import type { ArticleSummary, HighlightColor, HighlightSummary } from "@/lib/types";

export const HIGHLIGHT_SWATCH: Record<HighlightColor, string> = {
  yellow: "bg-[#fde68a]",
  green: "bg-[#bbf7d0]",
  blue: "bg-[#bfdbfe]",
  pink: "bg-[#fbcfe8]",
};
const COLORS = Object.keys(HIGHLIGHT_SWATCH) as HighlightColor[];

function isTouch() {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
  toast.success("Copied");
}

/** "“passage” — Title" plus the link, through the share sheet when there is one. */
export async function shareQuote(text: string, article: Pick<ArticleSummary, "title" | "link">) {
  const quote = `“${text}” — ${article.title}`;
  if (navigator.share) {
    try {
      await navigator.share({ text: quote, url: article.link });
      return;
    } catch {
      // Cancelled: fall back to copying.
    }
  }
  await navigator.clipboard.writeText(`${quote}\n${article.link}`);
  toast.success("Quote copied");
}

interface ReaderHighlightsProps {
  article: ArticleSummary;
  bodyRef: React.MutableRefObject<HTMLDivElement | null>;
  /** The scrolling element, to keep the toolbar next to the selection. */
  scrollRef: React.RefObject<HTMLElement>;
  highlights: HighlightSummary[];
}

/**
 * Select text → a toolbar to highlight it (four colours), add a note, copy or share it.
 * Tap a highlight → change its colour, write a note, copy, share or delete it.
 */
export function ReaderHighlights({
  article,
  bodyRef,
  scrollRef,
  highlights,
}: ReaderHighlightsProps) {
  const [selection, setSelection] = React.useState<{ quote: SelectionQuote; rect: DOMRect } | null>(
    null
  );
  const [open, setOpen] = React.useState<{ id: string; rect: DOMRect; focusNote: boolean } | null>(
    null
  );
  const lastQuote = React.useRef<SelectionQuote | null>(null);
  const busy = React.useRef(false);

  // Follow the selection. Hiding waits a moment, so tapping the toolbar on a phone (which
  // clears the selection first) still reaches its buttons.
  React.useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    function update() {
      const body = bodyRef.current;
      const quote = body ? readSelection(body) : null;
      if (quote) {
        clearTimeout(hideTimer);
        lastQuote.current = quote;
        const rect = window.getSelection()!.getRangeAt(0).getBoundingClientRect();
        setSelection({ quote, rect });
      } else {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => setSelection(null), 400);
      }
    }
    function onChange() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    }
    // An open highlight's panel moves with it.
    function onScroll() {
      onChange();
      setOpen((current) => {
        if (!current) return current;
        const mark = bodyRef.current?.querySelector(`mark[data-hl="${current.id}"]`);
        return mark ? { ...current, rect: mark.getBoundingClientRect() } : current;
      });
    }
    document.addEventListener("selectionchange", onChange);
    const scroller = scrollRef.current;
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(hideTimer);
      cancelAnimationFrame(frame);
      document.removeEventListener("selectionchange", onChange);
      scroller?.removeEventListener("scroll", onScroll);
    };
  }, [bodyRef, scrollRef]);

  // New article: nothing selected or open.
  React.useEffect(() => {
    setSelection(null);
    setOpen(null);
  }, [article.id]);

  // Tapping a highlight opens it (unless the tap was the end of a new selection).
  React.useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    function onClick(event: MouseEvent) {
      const mark = (event.target as HTMLElement).closest?.("mark[data-hl]") as HTMLElement | null;
      if (!mark) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()) return;
      event.preventDefault();
      setOpen({ id: mark.dataset.hl!, rect: mark.getBoundingClientRect(), focusNote: false });
    }
    body.addEventListener("click", onClick);
    return () => body.removeEventListener("click", onClick);
  });

  async function highlight(color: HighlightColor, withNote = false) {
    const quote = lastQuote.current;
    if (!quote || busy.current) return;
    busy.current = true;
    try {
      const created = await createHighlight({ articleId: article.id, color, ...quote });
      haptic();
      window.getSelection()?.removeAllRanges();
      setSelection(null);
      if (withNote) {
        // Wait for the mark to be drawn, then open it with the note field focused.
        requestAnimationFrame(() => {
          const mark = bodyRef.current?.querySelector(`mark[data-hl="${created.id}"]`);
          const rect = mark?.getBoundingClientRect() ?? selection?.rect ?? new DOMRect();
          setOpen({ id: created.id, rect, focusNote: true });
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the highlight");
    } finally {
      busy.current = false;
    }
  }

  // Desktop shortcut: h highlights the selection in yellow.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "h" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.closest?.("input, textarea, [contenteditable], [role=dialog]")) return;
      if (!selection) return;
      event.preventDefault();
      highlight("yellow");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const openHighlight = open ? highlights.find((h) => h.id === open.id) : undefined;

  return (
    <>
      {selection && !open && (
        <SelectionToolbar
          rect={selection.rect}
          onHighlight={(color) => highlight(color)}
          onNote={() => highlight("yellow", true)}
          onCopy={() => lastQuote.current && copyText(lastQuote.current.text)}
          onShare={() => lastQuote.current && shareQuote(lastQuote.current.text, article)}
        />
      )}
      {open && openHighlight && (
        <HighlightPanel
          key={openHighlight.id}
          highlight={openHighlight}
          article={article}
          rect={open.rect}
          focusNote={open.focusNote}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

/** Where a floating box goes: above the passage if there's room, else below; phones use the bottom. */
function floatingStyle(rect: DOMRect, height: number, width: number): React.CSSProperties {
  if (isTouch()) return {};
  const margin = 10;
  const top = rect.top - height - margin > 8 ? rect.top - height - margin : rect.bottom + margin;
  const left = Math.min(
    Math.max(8, rect.left + rect.width / 2 - width / 2),
    window.innerWidth - width - 8
  );
  return { top, left, width };
}

function SelectionToolbar({
  rect,
  onHighlight,
  onNote,
  onCopy,
  onShare,
}: {
  rect: DOMRect;
  onHighlight: (color: HighlightColor) => void;
  onNote: () => void;
  onCopy: () => void;
  onShare: () => void;
}) {
  const touch = isTouch();
  return (
    <div
      role="toolbar"
      aria-label="Highlight the selection"
      // Keep the selection: pressing a button would otherwise clear it before the click.
      onMouseDown={(event) => event.preventDefault()}
      style={floatingStyle(rect, 44, 300)}
      className={cn(
        "fixed z-50 flex items-center gap-0.5 rounded-full border bg-popover p-1 text-popover-foreground shadow-xl animate-fade-in",
        touch && "inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+16px)] mx-auto w-max"
      )}
    >
      <span className="flex items-center gap-1 px-1.5">
        <Highlighter className="mr-0.5 h-4 w-4 text-muted-foreground" aria-hidden />
        {COLORS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onHighlight(color)}
            className={cn(
              "h-7 w-7 rounded-full ring-1 ring-black/10 transition-transform hover:scale-110",
              HIGHLIGHT_SWATCH[color]
            )}
            aria-label={`Highlight in ${color}`}
          />
        ))}
      </span>
      <span className="mx-0.5 h-6 w-px bg-border" aria-hidden />
      <ToolbarButton label="Add a note" onClick={onNote}>
        <MessageSquarePlus className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton label="Copy" onClick={onCopy}>
        <Copy className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton label="Share" onClick={onShare}>
        <Share2 className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

/** A highlight opened from the text: colour, note, copy, share, delete. */
export function HighlightPanel({
  highlight,
  article,
  rect,
  focusNote,
  onClose,
}: {
  highlight: HighlightSummary;
  article: Pick<ArticleSummary, "title" | "link">;
  rect: DOMRect;
  focusNote: boolean;
  onClose: () => void;
}) {
  const [note, setNote] = React.useState(highlight.note ?? "");
  const [editing, setEditing] = React.useState(focusNote || Boolean(highlight.note));
  const noteRef = React.useRef<HTMLTextAreaElement>(null);
  useBackToClose(true, onClose);

  React.useEffect(() => {
    if (focusNote) noteRef.current?.focus();
  }, [focusNote]);

  async function saveNote() {
    const next = note.trim();
    if (next === (highlight.note ?? "")) return;
    try {
      await updateHighlight(highlight.id, { note: next || null });
      toast.success(next ? "Note saved" : "Note removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the note");
    }
  }

  function close() {
    onClose();
    saveNote();
  }

  async function remove() {
    try {
      await deleteHighlight(highlight.id);
      onClose();
      toast.success("Highlight removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the highlight");
    }
  }

  const touch = isTouch();
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={close} aria-hidden />
      <div
        role="dialog"
        aria-label="Highlight"
        style={floatingStyle(rect, editing ? 230 : 110, 340)}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
        }}
        className={cn(
          "fixed z-50 rounded-2xl border bg-popover p-3 text-popover-foreground shadow-xl animate-fade-in",
          touch && "inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+12px)]"
        )}
      >
        <div className="flex items-center gap-1.5">
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => updateHighlight(highlight.id, { color }).catch(() => undefined)}
              className={cn(
                "h-7 w-7 rounded-full ring-1 ring-black/10",
                HIGHLIGHT_SWATCH[color],
                highlight.color === color && "ring-2 ring-foreground"
              )}
              aria-label={`Change to ${color}`}
              aria-pressed={highlight.color === color}
            />
          ))}
          <span className="ml-auto flex items-center">
            <ToolbarButton label="Copy" onClick={() => copyText(highlight.text)}>
              <Copy className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton label="Share" onClick={() => shareQuote(highlight.text, article)}>
              <Share2 className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton label="Remove highlight" onClick={remove}>
              <Trash2 className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton label="Close" onClick={close}>
              <X className="h-4 w-4" />
            </ToolbarButton>
          </span>
        </div>
        {editing ? (
          <textarea
            ref={noteRef}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onBlur={saveNote}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) close();
            }}
            rows={4}
            placeholder="Write a note…"
            className="mt-2.5 w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              requestAnimationFrame(() => noteRef.current?.focus());
            }}
            className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <StickyNote className="h-4 w-4" /> Add a note
          </button>
        )}
      </div>
    </>
  );
}
