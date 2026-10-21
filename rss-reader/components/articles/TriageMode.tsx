"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Bookmark, BookOpen, Check, PartyPopper, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { cn, formatRelativeTime, readingTime, stripHtml } from "@/lib/utils";
import { durationLabel } from "@/lib/hooks/useVideo";
import { toggleArticleRead, toggleArticleSaved } from "@/lib/hooks/useArticles";
import { useBackToClose } from "@/lib/hooks/useHistorySync";
import { haptic } from "@/lib/native";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import { articleSource } from "@/components/articles/ArticleCard";
import type { ArticleSummary } from "@/lib/types";

// Triage: the unread of a list, one at a time, sorted in a few seconds each. Swipe left
// (or ←) to skip it, marked read; right (or →) to keep it for Later; Enter to open it.
// Each choice is saved as it's made, and Undo takes back the last one.

type Choice = "skip" | "keep" | "open";

const THRESHOLD = 110;

export function TriageMode({
  articles,
  hidden = false,
  onOpen,
  onClose,
}: {
  articles: ArticleSummary[];
  /** Out of the way while an article opened from it is read; it stays where it was. */
  hidden?: boolean;
  onOpen: (article: ArticleSummary) => void;
  onClose: () => void;
}) {
  // Taken once: the list changing underneath (marked read) mustn't move the pile.
  const [pile] = React.useState(() => articles.filter((a) => !a.isRead));
  const [index, setIndex] = React.useState(0);
  const [history, setHistory] = React.useState<{ article: ArticleSummary; choice: Choice }[]>([]);
  const [dx, setDx] = React.useState(0);
  const [leaving, setLeaving] = React.useState<Choice | null>(null);
  const drag = React.useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null);
  // Its history entry stays while an opened article is read on top: back leaves the
  // article first (back to triage), then a second back closes triage.
  useBackToClose(true, onClose);

  const article = pile[index] ?? null;
  const kept = history.filter((h) => h.choice === "keep").length;
  const skipped = history.filter((h) => h.choice === "skip").length;

  const choose = React.useCallback(
    (choice: Choice) => {
      if (!article || leaving) return;
      haptic(choice === "keep" ? "success" : "light");
      setLeaving(choice);
      const request =
        choice === "keep"
          ? article.isSaved
            ? Promise.resolve()
            : toggleArticleSaved(article.id, true)
          : toggleArticleRead(article.id, true);
      request.catch(() => toast.error("That one didn't save"));
      setHistory((h) => [...h, { article, choice }]);
      window.setTimeout(() => {
        setLeaving(null);
        setDx(0);
        setIndex((i) => i + 1);
      }, 180);
    },
    [article, leaving]
  );

  const undo = React.useCallback(() => {
    const last = history[history.length - 1];
    if (!last || leaving) return;
    haptic();
    const request =
      last.choice === "open"
        ? Promise.resolve()
        : last.choice === "keep"
          ? last.article.isSaved
            ? Promise.resolve()
            : toggleArticleSaved(last.article.id, false)
          : toggleArticleRead(last.article.id, false);
    request.catch(() => toast.error("Couldn't undo"));
    setHistory((h) => h.slice(0, -1));
    setIndex((i) => Math.max(0, i - 1));
  }, [history, leaving]);

  // Opening one reads it: the pile moves on, so coming back lands on the next card.
  const open = React.useCallback(
    (target: ArticleSummary) => {
      setHistory((h) => [...h, { article: target, choice: "open" }]);
      setIndex((i) => i + 1);
      onOpen(target);
    },
    [onOpen]
  );

  React.useEffect(() => {
    if (hidden) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") choose("skip");
      else if (event.key === "ArrowRight") choose("keep");
      else if (event.key === "Enter" && article) open(article);
      else if (event.key === "Backspace" || event.key.toLowerCase() === "z") undo();
      else return;
      event.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [choose, undo, article, open, hidden]);

  const offset = leaving === "keep" ? 600 : leaving === "skip" ? -600 : dx;

  return (
    <DialogPrimitive.Root open={!hidden} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col bg-background outline-none data-[state=open]:animate-fade-in"
        >
          <header className="flex items-center gap-2 px-3 pb-2 pt-safe">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="mt-2 flex h-11 w-11 items-center justify-center rounded-full hover:bg-accent"
            >
              <X className="h-5 w-5" />
            </button>
            <DialogPrimitive.Title className="mt-2 flex-1 text-center text-[15px] font-semibold">
              Triage
            </DialogPrimitive.Title>
            <span className="mt-2 w-11 text-right text-xs tabular-nums text-muted-foreground">
              {Math.min(index + 1, pile.length)}/{pile.length}
            </span>
          </header>
          <div className="mx-4 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width] duration-300"
              style={{ width: `${pile.length ? (index / pile.length) * 100 : 100}%` }}
            />
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 py-4">
            {article ? (
              <>
                {pile[index + 1] && (
                  <div
                    aria-hidden
                    className="absolute inset-x-8 bottom-6 top-8 rounded-3xl border bg-card opacity-60"
                  />
                )}
                <div
                  className={cn(
                    "relative flex h-full max-h-[34rem] w-full max-w-md touch-pan-y select-none flex-col overflow-hidden rounded-3xl border bg-card shadow-xl",
                    !drag.current && "transition-transform duration-200"
                  )}
                  style={{
                    transform: `translateX(${offset}px) rotate(${offset / 25}deg)`,
                  }}
                  onTouchStart={(event) => {
                    const t = event.touches[0];
                    drag.current = { x: t.clientX, y: t.clientY, horizontal: null };
                  }}
                  onTouchMove={(event) => {
                    const d = drag.current;
                    if (!d) return;
                    const t = event.touches[0];
                    const mx = t.clientX - d.x;
                    const my = t.clientY - d.y;
                    if (d.horizontal === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) {
                      d.horizontal = Math.abs(mx) > Math.abs(my);
                    }
                    if (d.horizontal) setDx(mx);
                  }}
                  onTouchEnd={() => {
                    drag.current = null;
                    if (dx >= THRESHOLD) choose("keep");
                    else if (dx <= -THRESHOLD) choose("skip");
                    else setDx(0);
                  }}
                >
                  <TriageCard article={article} />
                  <Stamp show={offset >= 40} className="left-4 border-primary text-primary">
                    Keep
                  </Stamp>
                  <Stamp
                    show={offset <= -40}
                    className="right-4 border-muted-foreground text-muted-foreground"
                  >
                    Skip
                  </Stamp>
                </div>
              </>
            ) : (
              <div className="flex max-w-xs flex-col items-center text-center">
                <PartyPopper className="h-10 w-10 text-primary" />
                <p className="mt-3 text-lg font-semibold">All clear</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {pile.length === 0
                    ? "Nothing unread here."
                    : `${kept} kept for Later, ${skipped} skipped.`}
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-5 h-11 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground"
                >
                  Done
                </button>
              </div>
            )}
          </div>

          {article && (
            <div className="flex items-center justify-center gap-4 px-4 pb-safe pt-1">
              <div className="flex items-center justify-center gap-4 pb-5">
                <RoundButton label="Undo" onClick={undo} disabled={history.length === 0} small>
                  <Undo2 className="h-5 w-5" />
                </RoundButton>
                <RoundButton label="Skip, mark read" onClick={() => choose("skip")}>
                  <Check className="h-6 w-6" />
                </RoundButton>
                <RoundButton label="Keep for Later" onClick={() => choose("keep")} primary>
                  <Bookmark className="h-6 w-6" />
                </RoundButton>
                <RoundButton label="Open" onClick={() => open(article)} small>
                  <BookOpen className="h-5 w-5" />
                </RoundButton>
              </div>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function TriageCard({ article }: { article: ArticleSummary }) {
  const [broken, setBroken] = React.useState(false);
  const source = articleSource(article);
  const text = (article.aiSummary || stripHtml(article.summary || article.content || "")).slice(
    0,
    600
  );
  const length = article.durationSeconds
    ? durationLabel(article.durationSeconds)
    : article.audioUrl || article.isVideo
      ? null
      : article.readingMinutes
        ? `${article.readingMinutes} min`
        : readingTime(article.content || article.summary);
  return (
    <>
      {article.imageUrl && !broken && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.imageUrl}
          alt=""
          draggable={false}
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="dim-dark aspect-[16/9] w-full shrink-0 bg-muted object-cover"
        />
      )}
      <div className="flex min-h-0 flex-1 flex-col p-5">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FeedFavicon title={source.name} faviconUrl={source.faviconUrl} size={16} />
          <span className="truncate font-medium text-foreground/80">{source.name}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0">{formatRelativeTime(article.publishedAt)}</span>
          {length && (
            <>
              <span aria-hidden>·</span>
              <span className="shrink-0">{length}</span>
            </>
          )}
        </p>
        <h2 className="mt-2 line-clamp-4 text-xl font-bold leading-snug">{article.title}</h2>
        {text && (
          <p className="mt-2 min-h-0 overflow-hidden text-[14.5px] leading-relaxed text-muted-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:8]">
            {text}
          </p>
        )}
      </div>
    </>
  );
}

function Stamp({
  show,
  className,
  children,
}: {
  show: boolean;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute top-4 rounded-lg border-2 bg-background/80 px-2.5 py-0.5 text-sm font-bold uppercase tracking-wider transition-opacity",
        show ? "opacity-100" : "opacity-0",
        className
      )}
    >
      {children}
    </span>
  );
}

function RoundButton({
  label,
  onClick,
  disabled,
  primary,
  small,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center justify-center rounded-full shadow-sm ring-1 ring-border transition-transform active:scale-90 disabled:opacity-40",
        small ? "h-12 w-12" : "h-16 w-16",
        primary ? "bg-primary text-primary-foreground ring-primary" : "bg-card"
      )}
    >
      {children}
    </button>
  );
}
