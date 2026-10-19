"use client";

import * as React from "react";
import useSWR from "swr";
import { BarChart3, BookOpen, Bookmark, Clock, Flame, Highlighter } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import { Ticker } from "@/components/ui/ticker";
import { useReaderState } from "@/lib/hooks/useReaderState";
import type { ReadingStats } from "@/lib/stats";

const TYPE_LABELS: Record<string, string> = {
  rss: "Sites",
  youtube: "YouTube",
  newsletter: "Newsletters",
  podcast: "Podcasts",
  manual: "Saved links",
};

function hours(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

function dayLabel(day: string, style: "short" | "long" = "short") {
  const date = new Date(`${day}T12:00:00`);
  return date.toLocaleDateString(
    undefined,
    style === "short"
      ? { day: "numeric", month: "short" }
      : { weekday: "long", day: "numeric", month: "long" }
  );
}

/** Your reading, in numbers: the last 30 days by day and hour, your top sources, a streak. */
export function StatsView() {
  const { data, isLoading } = useSWR<ReadingStats>("/api/stats", { revalidateOnFocus: false });
  const { setView } = useReaderState();

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-2xl px-5 py-6 md:py-10">
        <header className="flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-primary" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight">Your reading</h1>
            <p className="text-sm text-muted-foreground">The last 30 days, in numbers.</p>
          </div>
          {data && data.streak > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2.5 py-1 text-xs font-semibold text-orange-600 dark:text-orange-400"
              title="Days in a row with something read"
            >
              <Flame className="h-3.5 w-3.5" /> {data.streak} day{data.streak === 1 ? "" : "s"}
            </span>
          )}
        </header>

        {isLoading || !data ? (
          <div className="mt-6 grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat icon={<BookOpen className="h-4 w-4" />} label="Read" value={data.totals.read} />
              <Stat
                icon={<Clock className="h-4 w-4" />}
                label="Time"
                text={hours(data.totals.minutes)}
              />
              <Stat
                icon={<Highlighter className="h-4 w-4" />}
                label="Highlights"
                value={data.totals.highlights}
              />
              <Stat
                icon={<Bookmark className="h-4 w-4" />}
                label="Saved · finished"
                text={`${data.totals.saved} · ${data.totals.finished}`}
              />
            </div>

            <section className="mt-8" aria-label="Articles read per day">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                By day
              </h2>
              <Bars
                values={data.days.map((d) => d.read)}
                labels={data.days.map((d) => dayLabel(d.day))}
                titles={data.days.map(
                  (d) => `${dayLabel(d.day, "long")}: ${d.read} read, ${hours(d.minutes)}`
                )}
                className="mt-3 h-28"
              />
              <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                <span>{dayLabel(data.days[0].day)}</span>
                <span>Today</span>
              </div>
              {data.bestDay && data.bestDay.read > 0 && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Best day: {dayLabel(data.bestDay.day, "long")}, {data.bestDay.read} article
                  {data.bestDay.read === 1 ? "" : "s"}.
                </p>
              )}
            </section>

            <section className="mt-8" aria-label="When you read">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                When you read
              </h2>
              <Bars
                values={data.hours}
                labels={data.hours.map((_, h) => `${h}:00`)}
                titles={data.hours.map((n, h) => `${h}:00 – ${h + 1}:00: ${n} read`)}
                className="mt-3 h-20"
              />
              <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                <span>Midnight</span>
                <span>Noon</span>
                <span>Midnight</span>
              </div>
            </section>

            {data.sources.length > 0 && (
              <section className="mt-8" aria-label="Top sources">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Where you read
                </h2>
                <ol className="mt-3 space-y-2">
                  {data.sources.map((source) => {
                    const share = source.read / data.sources[0].read;
                    return (
                      <li key={source.id}>
                        <button
                          type="button"
                          onClick={() =>
                            setView({ type: "feed", id: source.id, label: source.title })
                          }
                          className="flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left hover:bg-accent/60"
                        >
                          <FeedFavicon
                            title={source.title}
                            faviconUrl={source.faviconUrl}
                            size={24}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2 text-sm">
                              <span className="truncate font-medium">{source.title}</span>
                              <span className="shrink-0 tabular-nums text-muted-foreground">
                                {source.read} · {hours(source.minutes)}
                              </span>
                            </span>
                            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                              <span
                                className="block h-full rounded-full bg-primary"
                                style={{ width: `${Math.max(4, share * 100)}%` }}
                              />
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}

            {data.types.length > 0 && (
              <section className="mt-8" aria-label="By kind">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  By kind
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {data.types.map((t) => (
                    <span key={t.type} className="rounded-full border px-3 py-1 text-xs">
                      {TYPE_LABELS[t.type] ?? t.type}{" "}
                      <span className="font-semibold tabular-nums">{t.read}</span>
                    </span>
                  ))}
                </div>
              </section>
            )}

            <p className="mt-10 text-center text-xs text-muted-foreground">
              All time: {data.totals.allTimeRead} read · {data.totals.allTimeHighlights} highlights
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  text,
}: {
  icon: React.ReactNode;
  label: string;
  value?: number;
  text?: string;
}) {
  return (
    <div className="rounded-2xl border bg-card/60 p-4">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="text-primary">{icon}</span> {label}
      </p>
      <p className="mt-1 font-serif text-2xl font-semibold tabular-nums">
        {value !== undefined ? <Ticker value={value} /> : text}
      </p>
    </div>
  );
}

/** A row of thin bars, each a day or an hour; the tallest fills the height. */
function Bars({
  values,
  labels,
  titles,
  className,
}: {
  values: number[];
  labels: string[];
  titles: string[];
  className?: string;
}) {
  const max = Math.max(1, ...values);
  return (
    <div
      className={cn("flex items-end gap-px", className)}
      role="img"
      aria-label={titles.join("; ")}
    >
      {values.map((value, i) => (
        <span
          key={i}
          title={titles[i]}
          aria-label={labels[i]}
          className={cn(
            "flex-1 rounded-t-sm transition-[height] duration-500",
            value > 0 ? "bg-primary" : "bg-muted"
          )}
          style={{ height: `${value > 0 ? Math.max(6, (value / max) * 100) : 3}%` }}
        />
      ))}
    </div>
  );
}
