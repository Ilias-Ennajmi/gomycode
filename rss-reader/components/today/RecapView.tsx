"use client";

import * as React from "react";
import useSWR from "swr";
import {
  BookOpen,
  CalendarRange,
  Clock,
  Highlighter,
  Newspaper,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import { StoryImage } from "@/components/news/StoryParts";
import { HIGHLIGHT_SWATCH } from "@/components/highlights/ReaderHighlights";
import { requestHighlightJump } from "@/lib/highlight-dom";
import { useReaderState } from "@/lib/hooks/useReaderState";
import type { HighlightSummary } from "@/lib/types";

interface Recap {
  week: string;
  from: string;
  to: string;
  stats: {
    read: number;
    minutes: number;
    saved: number;
    finished: number;
    highlights: number;
    notes: number;
    activeDays: number;
  };
  days: { date: string; read: number }[];
  topSources: { id: string; title: string; faviconUrl: string | null; read: number }[];
  stories: {
    articleId: string;
    headline: string;
    why: string;
    imageUrl: string | null;
    date: string;
    sources: string[];
  }[];
  highlights: HighlightSummary[];
  summary: string | null;
}

/** "2026-09-28" read as a local calendar day (not UTC midnight). */
function day(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatRange(from: string, to: string) {
  const format = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${format(day(from))} – ${format(day(to))}`;
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}

/** The weekly recap: your week in news and reading. */
export function RecapView() {
  const { data, isLoading } = useSWR<{ recap: Recap }>("/api/recap", { revalidateOnFocus: false });
  const recap = data?.recap;
  const { setSelectedArticleId, setMobilePane } = useReaderState();
  const open = (articleId: string) => {
    setSelectedArticleId(articleId);
    setMobilePane("reader");
  };

  return (
    <div className="h-full overflow-y-auto overscroll-contain scrollbar-thin">
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-5 md:px-8 md:pt-8">
        <header>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            <CalendarRange className="h-4 w-4" /> Weekly recap
          </p>
          <h1 className="mt-1 font-serif text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
            Your week
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {recap ? formatRange(recap.from, recap.to) : "The last seven days"}
          </p>
        </header>

        {isLoading || !recap ? (
          <RecapSkeleton />
        ) : (
          <div className="mt-8 space-y-12">
            {recap.summary && (
              <section className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-5 md:p-6">
                <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                  <Sparkles className="h-4 w-4" /> In short
                </h2>
                <p className="mt-2 font-serif text-xl leading-relaxed">{recap.summary}</p>
              </section>
            )}

            <section aria-label="Your reading">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                  icon={<BookOpen className="h-4 w-4" />}
                  value={recap.stats.read}
                  label="articles read"
                />
                <Stat
                  icon={<Clock className="h-4 w-4" />}
                  value={formatMinutes(recap.stats.minutes)}
                  label="of reading"
                />
                <Stat
                  icon={<Highlighter className="h-4 w-4" />}
                  value={recap.stats.highlights}
                  label={
                    recap.stats.notes ? `highlights · ${recap.stats.notes} notes` : "highlights"
                  }
                />
                <Stat
                  icon={<TrendingUp className="h-4 w-4" />}
                  value={`${recap.stats.activeDays}/7`}
                  label="days you read"
                />
              </div>
              <DayBars days={recap.days} />
              <p className="mt-3 text-sm text-muted-foreground">
                {recap.stats.saved} saved for later · {recap.stats.finished} finished from Later
              </p>
            </section>

            {recap.stories.length > 0 && (
              <section>
                <SectionTitle icon={<Newspaper className="h-5 w-5 text-primary" />}>
                  The stories of the week
                </SectionTitle>
                <ol className="divide-y">
                  {recap.stories.map((story) => (
                    <li key={story.date}>
                      <button
                        type="button"
                        onClick={() => open(story.articleId)}
                        className="group flex w-full gap-4 py-5 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                            {day(story.date).toLocaleDateString(undefined, { weekday: "long" })}
                          </p>
                          <h3 className="mt-0.5 text-balance font-serif text-xl font-semibold leading-snug group-hover:underline">
                            {story.headline}
                          </h3>
                          {story.why && (
                            <p className="mt-1.5 text-[14.5px] leading-snug text-foreground/80">
                              {story.why}
                            </p>
                          )}
                          {story.sources.length > 0 && (
                            <p className="mt-1.5 truncate text-xs text-muted-foreground">
                              {story.sources.slice(0, 4).join(" · ")}
                            </p>
                          )}
                        </div>
                        {story.imageUrl && (
                          <StoryImage
                            src={story.imageUrl}
                            className="h-20 w-24 shrink-0 rounded-lg sm:h-24 sm:w-32"
                          />
                        )}
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {recap.highlights.length > 0 && (
              <section>
                <SectionTitle icon={<Highlighter className="h-5 w-5 text-primary" />}>
                  What you kept
                </SectionTitle>
                <ul className="mt-4 space-y-5">
                  {recap.highlights.map((h) => (
                    <li key={h.id}>
                      <button
                        type="button"
                        onClick={() => {
                          requestHighlightJump(h.id);
                          open(h.articleId);
                        }}
                        className="flex w-full gap-3 text-left"
                      >
                        <span
                          className={cn("w-1 shrink-0 rounded-full", HIGHLIGHT_SWATCH[h.color])}
                          aria-hidden
                        />
                        <span className="min-w-0">
                          <span className="line-clamp-5 font-serif text-lg leading-relaxed">
                            {h.text}
                          </span>
                          {h.note && (
                            <span className="mt-1 block text-sm text-muted-foreground">
                              {h.note}
                            </span>
                          )}
                          {h.article && (
                            <span className="mt-1 block truncate text-xs text-muted-foreground">
                              {h.article.title}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {recap.topSources.length > 0 && (
              <section>
                <SectionTitle>Where you read the most</SectionTitle>
                <ul className="mt-3 space-y-2.5">
                  {recap.topSources.map((source) => (
                    <li key={source.id} className="flex items-center gap-2.5 text-[15px]">
                      <FeedFavicon title={source.title} faviconUrl={source.faviconUrl} size={20} />
                      <span className="min-w-0 flex-1 truncate">{source.title}</span>
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {source.read} read
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {recap.stats.read === 0 && recap.stories.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                A quiet week. Read a few articles and your recap fills up here.
              </p>
            )}

            <footer className="border-t pt-8 text-center text-sm text-muted-foreground">
              A new recap every Sunday evening.
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
}) {
  return (
    <div className="rounded-2xl border bg-card/60 p-4">
      <span className="text-primary">{icon}</span>
      <p className="mt-2 font-serif text-3xl font-semibold leading-none tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/** Seven small bars: articles read per day. */
function DayBars({ days }: { days: { date: string; read: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.read));
  return (
    <div className="mt-5 flex h-24 items-end gap-2" aria-label="Articles read per day">
      {days.map((d) => (
        <div key={d.date} className="flex flex-1 flex-col items-center gap-1.5">
          <span className="text-[10.5px] tabular-nums text-muted-foreground">{d.read || ""}</span>
          <div
            className={cn("w-full rounded-md", d.read ? "bg-primary/70" : "bg-muted")}
            style={{ height: `${Math.max(6, (d.read / max) * 56)}px` }}
            title={`${d.read} read`}
          />
          <span className="text-[10.5px] text-muted-foreground">
            {day(d.date).toLocaleDateString(undefined, { weekday: "narrow" })}
          </span>
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 border-b-2 border-foreground pb-2 font-serif text-2xl font-semibold tracking-tight">
      {icon}
      {children}
    </h2>
  );
}

function RecapSkeleton() {
  return (
    <div className="mt-8 space-y-8">
      <Skeleton className="h-28 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-24 w-full" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}
