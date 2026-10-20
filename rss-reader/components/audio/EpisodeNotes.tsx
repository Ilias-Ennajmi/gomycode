"use client";

import * as React from "react";
import { Image as ImageIcon, Play, Scissors, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { clockLabel } from "@/lib/snips";
import { shareQuoteImage } from "@/lib/quote-card";
import { deleteHighlight } from "@/lib/hooks/useHighlights";
import { useAudio } from "@/components/audio/AudioProvider";
import type { ArticleSummary, HighlightSummary, TimedText } from "@/lib/types";

/**
 * The notes under an episode, the way Snipd lays an episode out: your snips (each one a
 * title, what was said, a play button to the moment) and a search box over the transcript
 * that jumps to any line. The AI summary, chapters and key moments sit just above.
 */
export function EpisodeNotes({
  article,
  snips,
  transcript,
  onSeek,
}: {
  article: ArticleSummary;
  snips: HighlightSummary[];
  transcript: TimedText[];
  onSeek: (seconds: number) => void;
}) {
  const audio = useAudio();
  const playingThis = audio.episode?.id === article.id;
  const [query, setQuery] = React.useState("");
  const hits = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return transcript.filter((line) => line.text.toLowerCase().includes(q)).slice(0, 30);
  }, [query, transcript]);

  if (snips.length === 0 && transcript.length === 0) return null;

  return (
    <section className="mt-8 space-y-6" aria-label="Episode notes">
      {snips.length > 0 && (
        <div>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Scissors className="h-4 w-4 text-primary" /> Your snips
            <span className="text-muted-foreground">{snips.length}</span>
          </h2>
          <ul className="space-y-2">
            {snips.map((snip) => (
              <SnipCard key={snip.id} snip={snip} article={article} onSeek={onSeek} />
            ))}
          </ul>
        </div>
      )}
      {playingThis && snips.length === 0 && (
        <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
          Hear something worth keeping? Tap the scissors in the player (or press
          &ldquo;previous&rdquo; twice on your earbuds) to snip the last half-minute.
        </p>
      )}
      {transcript.length > 0 && (
        <div>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Search className="h-4 w-4" /> Search the transcript
          </h2>
          <div className="relative">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="A word or a name said in the episode…"
              aria-label="Search the transcript"
              className="h-10 w-full rounded-xl border bg-background px-3 pr-9 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {query.trim().length >= 2 && (
            <ul className="mt-2 divide-y rounded-xl border">
              {hits.length === 0 && (
                <li className="px-3 py-3 text-sm text-muted-foreground">
                  Not said in this episode.
                </li>
              )}
              {hits.map((line, i) => (
                <li key={`${line.t}-${i}`}>
                  <button
                    type="button"
                    onClick={() => onSeek(line.t)}
                    className="flex w-full items-start gap-3 px-3 py-2.5 text-left text-sm hover:bg-accent/60"
                  >
                    <span className="mt-0.5 shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-primary">
                      {clockLabel(line.t)}
                    </span>
                    <span className="line-clamp-3">{mark(line.text, query)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function mark(text: string, query: string) {
  const q = query.trim();
  const index = text.toLowerCase().indexOf(q.toLowerCase());
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded bg-primary/25 px-0.5 text-inherit">
        {text.slice(index, index + q.length)}
      </mark>
      {text.slice(index + q.length)}
    </>
  );
}

export function SnipCard({
  snip,
  article,
  onSeek,
}: {
  snip: HighlightSummary;
  article: ArticleSummary;
  onSeek: (seconds: number) => void;
}) {
  const start = snip.startSeconds ?? 0;
  const [gone, setGone] = React.useState(false);
  if (gone) return null;
  return (
    <li className="rounded-2xl border bg-card/60 p-3.5 shadow-sm">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onSeek(start)}
          aria-label={`Play from ${clockLabel(start)}`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-95"
        >
          <Play className="ml-0.5 h-4 w-4 fill-current" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {clockLabel(start)}
            {snip.endSeconds ? ` – ${clockLabel(snip.endSeconds)}` : ""}
          </p>
          {snip.title && <p className="font-semibold leading-snug">{snip.title}</p>}
          {snip.note && <p className="mt-1 text-sm">{snip.note}</p>}
          <p className={cn("mt-1.5 line-clamp-3 text-sm text-muted-foreground")}>{snip.text}</p>
        </div>
        <div className="flex shrink-0 flex-col">
          <button
            type="button"
            aria-label="Share as a picture"
            title="Share as a picture"
            onClick={() =>
              shareQuoteImage({
                text: snip.text,
                color: snip.color,
                source: `${article.title} · ${article.feed.title}`,
                moment: `${clockLabel(start)}${snip.endSeconds ? ` – ${clockLabel(snip.endSeconds)}` : ""}`,
              }).catch(() => toast.error("Could not make the picture"))
            }
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ImageIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Remove snip"
            title="Remove snip"
            onClick={() =>
              deleteHighlight(snip.id)
                .then(() => setGone(true))
                .catch(() => toast.error("Could not remove the snip"))
            }
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}
