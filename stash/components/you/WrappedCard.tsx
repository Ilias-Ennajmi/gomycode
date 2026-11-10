"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Share2 } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { cx } from "@/components/ui/cx";
import { SPACE_BG } from "@/components/ui/space";
import { getBrowserClient } from "@/lib/supabase/client";
import { barPercent, monthKey, monthLabel, parseWrapped, shiftMonth, wrappedShareText, type Wrapped } from "@/lib/wrapped";

const CACHE = "stash.wrapped.";
const OLDEST_MONTHS = 24;

function readCache(month: string): Wrapped | null {
  try {
    return JSON.parse(localStorage.getItem(CACHE + month) ?? "null") as Wrapped | null;
  } catch {
    return null;
  }
}

/**
 * You → Saved Wrapped: a month in saves. Saved / watched / applied as bars (neutral,
 * with the accent only on "applied", the step that means acting), top Spaces in their
 * own colours, top creators, and "Share my month": the month as a picture (PNG, drawn
 * in the brand's look) through the share sheet, or downloaded where sharing files isn't possible.
 */
export function WrappedCard() {
  const { toast } = useToast();
  const [current] = useState(() => monthKey(new Date()));
  const [month, setMonth] = useState(current);
  const [data, setData] = useState<Wrapped | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "offline">("loading");
  const [sharing, setSharing] = useState(false);
  const card = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    const cached = readCache(month);
    // localStorage is only readable after mount; show the last copy while the network answers.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(cached);
    setState(cached ? "ready" : "loading");
    const supabase = getBrowserClient();
    if (!supabase) {
      setState(cached ? "ready" : "offline");
      return;
    }
    void supabase.rpc("wrapped", { p_month: month }).then(({ data: raw, error }) => {
      if (cancelled) return;
      if (error) {
        setState(cached ? "ready" : "offline");
        return;
      }
      const w = parseWrapped(raw, month);
      setData(w);
      setState("ready");
      try {
        localStorage.setItem(CACHE + month, JSON.stringify(w));
      } catch {
        // cache is a convenience only
      }
    });
    return () => {
      cancelled = true;
    };
  }, [month]);

  const isCurrent = month === current;
  const oldest = shiftMonth(current, -OLDEST_MONTHS);
  const stats = data
    ? [
        { key: "saved", label: "saved", value: data.saved },
        { key: "watched", label: "watched", value: data.watched },
        { key: "applied", label: "applied", value: data.applied },
      ]
    : [];
  const spaceMax = Math.max(1, ...(data?.topSpaces.map((s) => s.count) ?? [1]));

  const share = async () => {
    if (!data || !card.current || sharing) return;
    const text = wrappedShareText(data, isCurrent);
    setSharing(true);
    try {
      // The drawing code is only fetched when someone shares.
      const { drawPoster, posterFileName, posterModel, sharePoster } = await import("@/lib/wrappedImage");
      const canvas = await drawPoster(posterModel(data, isCurrent), card.current);
      const outcome = await sharePoster(canvas, posterFileName(data.month), text);
      if (outcome === "downloaded") toast({ message: "Saved as a picture in your downloads" });
    } catch {
      // No canvas here: the words still go out.
      if (navigator.share) void navigator.share({ title: "My month in Stash", text }).catch(() => {});
      else void navigator.clipboard?.writeText(text).then(() => toast({ message: "Copied" }));
    } finally {
      setSharing(false);
    }
  };

  return (
    // Wrapped is a poster: always the deep-ink brand look (dark tokens), whatever the theme.
    <section
      ref={card}
      data-theme="dark"
      aria-labelledby="wrapped-title"
      className="rise-in relative mx-4 flex flex-col gap-5 overflow-hidden rounded-xl bg-surface p-5 text-fg shadow-raised ring-1 ring-line"
    >
      <div className="relative flex items-center gap-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="text-label text-brand-lime">Saved Wrapped</p>
          <h2 id="wrapped-title" className="text-title" aria-live="polite" suppressHydrationWarning>
            {monthLabel(month)}
            {isCurrent ? " so far" : ""}
          </h2>
        </div>
        <IconButton label="Previous month" icon={ChevronLeft} variant="raised" disabled={month <= oldest} onClick={() => setMonth((m) => shiftMonth(m, -1))} />
        <IconButton label="Next month" icon={ChevronRight} variant="raised" disabled={isCurrent} onClick={() => setMonth((m) => shiftMonth(m, 1))} />
      </div>

      {state === "loading" && !data ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-6" />
          <Skeleton className="h-6" />
        </div>
      ) : !data ? (
        <p className="text-body text-fg-muted">Your month in saves shows here once this phone is connected.</p>
      ) : data.saved === 0 && data.watched === 0 && data.applied === 0 ? (
        <p className="text-body text-fg-muted">
          {isCurrent ? "Nothing yet this month. Share a reel to Stash to start." : `Nothing saved in ${monthLabel(month, false)}.`}
        </p>
      ) : (
        <>
          <dl aria-label="Saved, watched and applied" className="relative grid grid-cols-3 gap-2">
            {stats.map((b, i) => (
              <div key={b.key} className="rise-in flex flex-col-reverse rounded-lg bg-raised px-3 py-3" style={{ animationDelay: `calc(var(--dur-press) * ${i})` }}>
                <dt className="text-label text-fg-muted">{b.label}</dt>
                <dd className={cx("text-hero tabular-nums", b.key === "applied" && "text-brand-lime")}>{b.value}</dd>
              </div>
            ))}
          </dl>
          {(data.kept > 0 || data.recalled > 0) && (
            <p className="-mt-2 text-caption text-fg-muted">
              {data.kept} kept · {data.recalled} recall {data.recalled === 1 ? "answer" : "answers"}
              {data.saved > 0 ? ` · ${Math.round((data.watched / data.saved) * 100)}% watched` : ""}
            </p>
          )}

          {data.topSpaces.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-label text-fg-muted">Top Spaces</h3>
              <ul className="flex flex-col gap-2">
                {data.topSpaces.map((s) => (
                  <li key={s.id} className="relative flex h-11 items-center overflow-hidden rounded-full bg-raised">
                    <span aria-hidden className={cx("absolute inset-y-0 left-0 rounded-full", SPACE_BG[s.color])} style={{ width: `${barPercent(s.count, spaceMax)}%` }} />
                    {/* Name and count sit on a solid chip so they read over any bar length. */}
                    <span className="relative ml-1.5 inline-flex h-8 min-w-0 items-center gap-2 rounded-full bg-background px-3 text-label">
                      <span className="truncate">{s.name}</span>
                      <span className="tabular-nums text-fg-muted">{s.count}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.topCreators.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className="text-label text-fg-muted">Top creators</h3>
              <ol className="flex flex-col">
                {data.topCreators.map((c, i) => (
                  <li key={c.handle} className="flex min-h-11 items-center gap-3 text-body text-fg">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-raised font-display text-caption tabular-nums">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{c.handle}</span>
                    <span className="text-caption text-fg-muted tabular-nums">
                      {c.count} {c.count === 1 ? "save" : "saves"}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <button
            type="button"
            onClick={() => void share()}
            aria-busy={sharing || undefined}
            className="press inline-flex h-12 items-center justify-center gap-2 rounded-full bg-fg px-4 text-label text-background"
          >
            <Share2 size={20} strokeWidth={2} aria-hidden />
            {sharing ? "Making the picture…" : "Share my month as a picture"}
          </button>
        </>
      )}
    </section>
  );
}
