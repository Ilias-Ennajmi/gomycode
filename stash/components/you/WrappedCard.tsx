"use client";

import { useEffect, useState } from "react";
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
 * own colours, top creators, and "Share my month" as text through the share sheet.
 */
export function WrappedCard() {
  const { toast } = useToast();
  const [current] = useState(() => monthKey(new Date()));
  const [month, setMonth] = useState(current);
  const [data, setData] = useState<Wrapped | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "offline">("loading");

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
  const bars = data
    ? [
        { key: "saved", label: "Saved", value: data.saved, fill: "bg-fg-subtle" },
        { key: "watched", label: "Watched", value: data.watched, fill: "bg-fg-muted" },
        { key: "applied", label: "Applied", value: data.applied, fill: "bg-accent" },
      ]
    : [];
  const max = Math.max(1, ...bars.map((b) => b.value));
  const spaceMax = Math.max(1, ...(data?.topSpaces.map((s) => s.count) ?? [1]));

  const share = () => {
    if (!data) return;
    const text = wrappedShareText(data, isCurrent);
    if (navigator.share) void navigator.share({ title: "My month in Stash", text }).catch(() => {});
    else void navigator.clipboard?.writeText(text).then(() => toast({ message: "Copied" }));
  };

  return (
    <section aria-labelledby="wrapped-title" className="mx-4 flex flex-col gap-4 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center gap-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 id="wrapped-title" className="text-heading">
            Saved Wrapped
          </h2>
          <p className="text-caption text-fg-muted" aria-live="polite" suppressHydrationWarning>
            {monthLabel(month)}
            {isCurrent ? " · so far" : ""}
          </p>
        </div>
        <IconButton label="Previous month" icon={ChevronLeft} disabled={month <= oldest} onClick={() => setMonth((m) => shiftMonth(m, -1))} />
        <IconButton label="Next month" icon={ChevronRight} disabled={isCurrent} onClick={() => setMonth((m) => shiftMonth(m, 1))} />
      </div>

      {state === "loading" && !data ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6" />
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
          <ul aria-label="Saved, watched and applied" className="flex flex-col gap-2">
            {bars.map((b) => (
              <li key={b.key} className="grid grid-cols-4 items-center gap-3">
                <span className="text-label text-fg">{b.label}</span>
                <span className="col-span-2 h-3 overflow-hidden rounded-full bg-raised" aria-hidden>
                  <span className={cx("block h-full rounded-full", b.fill)} style={{ width: `${barPercent(b.value, max)}%` }} />
                </span>
                <span className="text-right text-label text-fg tabular-nums">{b.value}</span>
              </li>
            ))}
          </ul>
          {(data.kept > 0 || data.recalled > 0) && (
            <p className="text-caption text-fg-muted">
              {data.kept} kept · {data.recalled} recall {data.recalled === 1 ? "answer" : "answers"}
            </p>
          )}

          {data.topSpaces.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-label text-fg-muted">Top Spaces</h3>
              <ul className="flex flex-col gap-2">
                {data.topSpaces.map((s) => (
                  <li key={s.id} className="flex flex-col gap-1">
                    {/* Name on its own line: Space names are too long for a column at 360 px. */}
                    <span className="flex items-center gap-2 text-label text-fg">
                      <span aria-hidden className={cx("h-2 w-2 shrink-0 rounded-full", SPACE_BG[s.color])} />
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      <span className="tabular-nums">{s.count}</span>
                    </span>
                    <span className="h-3 overflow-hidden rounded-full bg-raised" aria-hidden>
                      <span className={cx("block h-full rounded-full", SPACE_BG[s.color])} style={{ width: `${barPercent(s.count, spaceMax)}%` }} />
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
                  <li key={c.handle} className="flex min-h-10 items-center gap-3 text-body text-fg">
                    <span className="w-5 text-caption text-fg-muted tabular-nums">{i + 1}</span>
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
            onClick={share}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-card border border-line px-4 text-label text-fg active:scale-95"
          >
            <Share2 size={20} strokeWidth={2} aria-hidden />
            Share my month
          </button>
        </>
      )}
    </section>
  );
}
