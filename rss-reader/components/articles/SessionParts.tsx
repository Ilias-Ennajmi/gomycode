"use client";

import * as React from "react";
import { ChevronRight, PartyPopper, Play, Timer, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { endSession, minutesLeft, useSession, type ReadingSession } from "@/lib/session";
import { useReaderState } from "@/lib/hooks/useReaderState";
import { useIsPhone } from "@/components/ui/sheet";
import { requestAppEvent } from "@/lib/app-events";
import type { ArticleSummary } from "@/lib/types";

// The pieces of a reading session around the reader: a thin bar on top (where you are,
// end it), a big "next" card at the end of each piece (or "done" after the last), and,
// once you've left the reader, a pill to pick up where you were.

function Dots({ session }: { session: ReadingSession }) {
  return (
    <span className="flex items-center gap-1" aria-hidden>
      {session.items.map((item, i) => (
        <span
          key={item.id}
          className={cn(
            "h-1.5 rounded-full transition-all",
            i === session.index
              ? "w-4 bg-primary"
              : session.seen.includes(item.id)
                ? "w-1.5 bg-primary/60"
                : "w-1.5 bg-muted-foreground/30"
          )}
        />
      ))}
    </span>
  );
}

export function SessionBanner({ session }: { session: ReadingSession }) {
  return (
    <div className="mb-5 flex items-center gap-3 rounded-full bg-primary/10 py-1.5 pl-3.5 pr-1.5 text-xs font-semibold text-primary">
      <Timer className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{session.title}</span>
      <Dots session={session} />
      <span className="ml-auto shrink-0 tabular-nums">
        {session.index + 1} of {session.items.length}
      </span>
      <button
        type="button"
        onClick={endSession}
        aria-label="End this session"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-primary/15"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** At the end of a piece: the next one, big, or the session's end. */
export function SessionNext({
  session,
  next,
  onGo,
}: {
  session: ReadingSession;
  next: ArticleSummary | null;
  onGo: (article: ArticleSummary) => void;
}) {
  const { setSelectedArticleId, setMobilePane } = useReaderState();
  if (!next) {
    return (
      <section className="mt-12 flex flex-col items-center rounded-3xl bg-primary/10 px-6 py-8 text-center">
        <PartyPopper className="h-8 w-8 text-primary" />
        <p className="mt-2 text-lg font-semibold">That&rsquo;s your {session.minutes} minutes</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {session.seen.length} of {session.items.length} opened.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => {
              endSession();
              requestAppEvent("time-pile");
            }}
            className="h-10 rounded-full px-4 text-sm font-semibold ring-1 ring-border hover:bg-accent"
          >
            Another round
          </button>
          <button
            type="button"
            onClick={() => {
              endSession();
              setSelectedArticleId(null);
              setMobilePane("list");
            }}
            className="h-10 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            Done
          </button>
        </div>
      </section>
    );
  }
  const minutes = minutesLeft(next);
  return (
    <nav aria-label="Next in this session" className="mt-12">
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
        <Timer className="h-3.5 w-3.5" /> Next in {session.title.toLowerCase()}
        <span className="ml-auto normal-case tracking-normal text-muted-foreground">
          {session.index + 2} of {session.items.length}
        </span>
      </p>
      <button
        type="button"
        onClick={() => onGo(next)}
        className="group block w-full overflow-hidden rounded-3xl border bg-card text-left shadow-sm transition-transform active:scale-[0.99]"
      >
        {next.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={next.imageUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="dim-dark aspect-[2/1] w-full bg-muted object-cover"
            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
          />
        )}
        <span className="flex items-center gap-3 p-4">
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 block text-[17px] font-semibold leading-snug">
              {next.title}
            </span>
            <span className="mt-1 block truncate text-xs text-muted-foreground">
              {next.feed.title}
              {minutes ? ` · ${Math.round(minutes)} min` : ""}
            </span>
          </span>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform group-hover:translate-x-0.5">
            <ChevronRight className="h-5 w-5" />
          </span>
        </span>
      </button>
      <p className="mt-3 text-center text-xs text-muted-foreground md:hidden">
        Or swipe left for the next one
      </p>
    </nav>
  );
}

/** Outside the reader: back to the piece you were on. */
export function ResumeSessionPill() {
  const session = useSession();
  const { selectedArticleId, setSelectedArticleId, setMobilePane, mobilePane } = useReaderState();
  const current = session?.items[session.index];
  const phone = useIsPhone();
  if (!session) return null;
  // Already reading it.
  if (current && selectedArticleId === current.id && (!phone || mobilePane === "reader")) {
    return null;
  }
  if (mobilePane === "settings") return null;
  return (
    // Sits just above the now-playing bar and the tab bar (it's placed before them).
    <div className="pointer-events-none absolute inset-x-0 bottom-full z-30 mb-3 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-sm items-center gap-1 rounded-full bg-foreground py-1 pl-1 pr-1 text-background shadow-xl animate-sheet-in">
        <button
          type="button"
          onClick={() => {
            if (!current) return;
            setSelectedArticleId(current.id);
            setMobilePane("reader");
          }}
          className="flex min-w-0 items-center gap-2 rounded-full py-1.5 pl-3 pr-2 text-left"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase tracking-wide opacity-70">
              {session.title} · {session.index + 1}/{session.items.length}
            </span>
            <span className="block truncate text-[13px] font-semibold">{current?.title}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={endSession}
          aria-label="End this session"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-background/15"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
