"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, Flame, GraduationCap, Layers, Play, RefreshCw, Timer, User } from "lucide-react";
import { AskRow, AskSheet } from "@/components/ask/AskEntry";
import { AiLabel } from "@/components/ui/AiLabel";
import { Button } from "@/components/ui/Button";
import { ProgressSegments } from "@/components/ui/ProgressSegments";
import { Segmented } from "@/components/ui/Segmented";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { cx } from "@/components/ui/cx";
import { SPACE_BG, SPACE_TINT, type SpaceColor } from "@/components/ui/space";
import { Logo } from "@/components/brand/Logo";
import { cardText } from "@/components/library/SaveGrid";
import { PullToRefresh } from "@/components/today/PullToRefresh";
import { QuickSort } from "@/components/today/QuickSort";
import { Welcome } from "@/components/today/Welcome";
import { NearbyCard } from "@/components/places/NearbyCard";
import { useLoop } from "@/lib/hooks/useLoop";
import { estimateMinutes, hashString, QUEUE_LENGTHS } from "@/lib/dailyQueue";
import { WEEK_GOAL } from "@/lib/streak";
import { getBrowserClient } from "@/lib/supabase/client";
import type { SaveItem } from "@/lib/data";

const LENGTH_OPTIONS = QUEUE_LENGTHS.map((m) => ({ value: String(m), label: `${m} min` }));
const OLD_DAYS = 30;

function useInitial(): string | null {
  const [initial, setInitial] = useState<string | null>(null);
  useEffect(() => {
    const supabase = getBrowserClient();
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data }) => {
      const meta = data.user?.user_metadata as { full_name?: string; name?: string } | undefined;
      const name = meta?.full_name || meta?.name || data.user?.email || "";
      setInitial(name ? name.trim()[0].toUpperCase() : null);
    });
  }, []);
  return initial;
}

type ForYou = {
  kind: "pattern" | "reminder" | "again";
  id: string;
  title: string;
  text: string;
  href: string;
  /** The Space it belongs to: its colour fills the card. */
  color?: SpaceColor;
  space?: string;
};
// Phase 3 adds a "Place nearby" card (NearbyCard) in front of these.

export function TodayView() {
  const router = useRouter();
  const loop = useLoop();
  const { lib } = loop;
  const initial = useInitial();
  const [lengthOpen, setLengthOpen] = useState(false);
  const [nearbyShown, setNearbyShown] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);

  const spacesById = useMemo(() => new Map(lib.spaces.map((s) => [s.id, s])), [lib.spaces]);
  const inboxId = lib.spaces.find((s) => s.kind === "inbox")?.id ?? null;
  const savesById = useMemo(() => new Map(lib.saves.map((s) => [s.id, s])), [lib.saves]);

  const unsorted = useMemo(
    () =>
      lib.saves.filter(
        (s) => !s.archivedAt && (!s.spaceId || s.spaceId === inboxId) && s.status !== "queued" && s.status !== "processing",
      ),
    [lib.saves, inboxId],
  );

  const items = loop.queueItems;
  const done = new Set(loop.queue?.doneIds ?? []);
  const remaining = items.filter((s) => !done.has(s.id));
  const allDone = items.length > 0 && remaining.length === 0;
  const minutes = estimateMinutes((remaining.length ? remaining : items).map((s) => s.duration));

  const forYou = useMemo(() => {
    const out: ForYou[] = [];
    const syn = loop.syntheses[0];
    if (syn && syn.points[0]) {
      const space = syn.spaceId ? spacesById.get(syn.spaceId) : undefined;
      const title = space?.name ?? syn.topic ?? "Your saves";
      out.push({ kind: "pattern", id: syn.id, title, text: syn.points[0], href: "/learn#syntheses", color: space?.color, space: title });
    }
    for (const r of loop.reminders.slice(0, 2)) {
      const s = savesById.get(r.saveId);
      const sp = s?.spaceId ? spacesById.get(s.spaceId) : undefined;
      if (s && !s.archivedAt) out.push({ kind: "reminder", id: r.id, title: "Reminder", text: cardText(s), href: `/item/${s.id}`, color: sp?.color, space: sp?.name });
    }
    // An old save worth another look, picked per day so it changes daily but not on every visit.
    const cutoff = Date.parse(`${loop.day}T00:00:00`) - OLD_DAYS * 86_400_000;
    const queued = new Set(loop.queue?.saveIds ?? []);
    const old = lib.saves.filter(
      (s) => !s.archivedAt && !queued.has(s.id) && Date.parse(s.savedAt) < cutoff && (s.kept || !s.watchedAt) && s.status === "ready",
    );
    if (old.length) {
      const pick = old[hashString(loop.day) % old.length];
      const sp = pick.spaceId ? spacesById.get(pick.spaceId) : undefined;
      out.push({ kind: "again", id: pick.id, title: "Worth another look", text: cardText(pick), href: `/item/${pick.id}`, color: sp?.color, space: sp?.name });
    }
    return out.slice(0, 5);
  }, [loop.syntheses, loop.reminders, loop.queue, loop.day, lib.saves, savesById, spacesById]);

  const firstLoad = !loop.loaded || (lib.loading && lib.saves.length === 0);
  const empty = !firstLoad && lib.synced && lib.saves.length === 0 && lib.queued.length === 0;
  const weekDone = Math.min(loop.weekDays, WEEK_GOAL);
  const left = remaining.length;

  // First run: no saves yet. Welcome explains how sharing into Stash works.
  if (empty) return <Welcome />;

  const header = (
    <header className="flex items-start justify-between gap-4 px-4 pt-6 pb-5">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex items-center gap-2 text-label text-fg-muted" suppressHydrationWarning>
          <Logo variant="tile" size={22} />
          {loop.day ? new Date(`${loop.day}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : ""}
        </p>
        <h1 className="text-display">Today</h1>
        <div className="mt-2 flex items-center gap-3">
          <ProgressSegments total={WEEK_GOAL} filled={loop.weekDays} label={`${weekDone} of ${WEEK_GOAL} days this week`} className="max-w-36" />
          <span className="shrink-0 text-caption text-fg-muted">
            {weekDone} of {WEEK_GOAL} days this week
          </span>
        </div>
      </div>
      <Link
        href="/you"
        aria-label="You"
        className="press flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-fg font-display text-heading text-background"
      >
        {initial ?? <User size={24} strokeWidth={2} aria-hidden />}
      </Link>
    </header>
  );

  return (
    <PullToRefresh
      onRefresh={async () => {
        await lib.refresh();
        await loop.rebuild();
      }}
    >
      {header}
      <div className="flex flex-col gap-7 px-4 pb-6">
        {/* Hero: accent = act now. */}
        {firstLoad ? (
          <Skeleton shape="block" className="h-72 rounded-xl" />
        ) : (
          <section aria-labelledby="hero-title" className="rise-in relative flex flex-col gap-5 overflow-hidden rounded-xl bg-accent p-5 text-on-accent shadow-pop">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <h2 id="hero-title" className="text-display">
                  {allDone ? `All ${items.length} done` : `Your ${items.length || 5} for today`}
                </h2>
                <p className="text-label">
                  {allDone
                    ? "Nice. Lock it in with a quick recall."
                    : items.length
                      ? `${left} to watch · about ${minutes} min`
                      : "Fills in once a save finishes processing."}
                </p>
              </div>
              {loop.streak > 0 && (
                <span className="pop-in flex h-10 shrink-0 items-center gap-1 rounded-full bg-on-accent px-3 text-label text-accent" aria-label={`${loop.streak}-day streak`}>
                  <Flame size={20} strokeWidth={2.25} aria-hidden /> {loop.streak}
                </span>
              )}
            </div>
            {items.length > 0 && (
              <ul className="grid grid-cols-5 gap-2" aria-label="Today's queue">
                {items.slice(0, 5).map((s, i) => (
                  <QueueThumb
                    key={s.id}
                    index={i}
                    save={s}
                    done={done.has(s.id)}
                    src={s.thumbPath ? lib.thumbs[s.thumbPath] : undefined}
                    color={s.spaceId ? spacesById.get(s.spaceId)?.color : undefined}
                  />
                ))}
              </ul>
            )}
            {items.length > 5 && <p className="-mt-2 text-caption">+ {items.length - 5} more</p>}
            <div className="flex items-center gap-2">
              {allDone ? (
                <Button variant="on-accent" size="lg" icon={GraduationCap} className="flex-1" onClick={() => router.push("/learn")}>
                  Start recall
                </Button>
              ) : (
                <Button variant="on-accent" size="lg" icon={Play} className="flex-1" disabled={!items.length} onClick={() => router.push("/play?queue=today")}>
                  {done.size > 0 && left > 0 ? "Keep going" : "Start"} · {minutes} min
                </Button>
              )}
              <button
                type="button"
                onClick={() => setLengthOpen(true)}
                aria-label={`Change length, now ${loop.settings.queueMinutes} minutes`}
                className="press inline-flex h-14 shrink-0 items-center gap-2 rounded-full border-2 border-on-accent/30 px-4 text-label text-on-accent"
              >
                <Timer size={20} strokeWidth={2.25} aria-hidden />
                {loop.settings.queueMinutes} min
              </button>
            </div>
          </section>
        )}

        {!firstLoad && <AskRow onClick={() => setAskOpen(true)} className="rise-in -mt-2" />}

        {/* The section stays mounted so the Place-nearby card can look for a place; hidden while empty. */}
        <section aria-labelledby="for-you" className={cx("flex flex-col gap-3", forYou.length === 0 && !nearbyShown && "hidden")}>
          <h2 id="for-you" className="text-title">
            For you
          </h2>
          <ul className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1">
            <li className={cx("w-4/5 shrink-0 snap-start", !nearbyShown && "hidden")}>
              <NearbyCard className="h-full" onShow={setNearbyShown} />
            </li>
            {forYou.slice(0, nearbyShown ? 4 : 5).map((f, i) => {
              const color = f.color ?? "inbox";
              return (
                <li key={`${f.kind}-${f.id}`} className="rise-in w-4/5 shrink-0 snap-start" style={{ animationDelay: `calc(var(--dur-press) * ${i})` }}>
                  <Link href={f.href} className={cx("press flex h-full min-h-44 flex-col gap-2 rounded-lg p-5 text-fg", SPACE_TINT[color])}>
                    {f.kind === "pattern" ? (
                      <AiLabel text="Pattern spotted" />
                    ) : (
                      <span className="flex items-center gap-2 text-label text-fg-muted">
                        {f.kind === "reminder" ? <Bell size={20} strokeWidth={2} aria-hidden /> : <RefreshCw size={20} strokeWidth={2} aria-hidden />}
                        {f.title}
                      </span>
                    )}
                    <p className="line-clamp-3 text-heading">{f.text}</p>
                    {f.space && (
                      <span className="mt-auto inline-flex items-center gap-2 pt-1 text-caption text-fg-muted">
                        <span aria-hidden className={cx("h-2.5 w-2.5 rounded-full", SPACE_BG[color])} />
                        {f.space}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {(unsorted.length > 0 || loop.dueCards.length > 0) && (
          <section aria-label="To do" className="flex flex-col gap-3">
            {unsorted.length > 0 && (
              <div className="rise-in flex items-center gap-4 rounded-lg bg-surface p-4 shadow-pop">
                <StackPreview srcs={unsorted.slice(0, 3).map((s) => (s.thumbPath ? lib.thumbs[s.thumbPath] : undefined))} />
                <div className="min-w-0 flex-1">
                  <p className="text-heading">
                    {unsorted.length} {unsorted.length === 1 ? "save" : "saves"} to sort
                  </p>
                  <p className="text-caption text-fg-muted">In your Inbox · about 30 s</p>
                </div>
                <Button variant="ink" onClick={() => setSortOpen(true)} aria-label="Quick sort your Inbox">
                  Sort
                </Button>
              </div>
            )}

            {loop.dueCards.length > 0 && (
              <div className="rise-in flex items-center gap-4 rounded-lg bg-surface p-4 shadow-pop" style={{ animationDelay: "var(--dur-press)" }}>
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-card bg-raised text-fg">
                  <GraduationCap size={26} strokeWidth={2} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-heading">
                    {loop.dueCards.length} recall {loop.dueCards.length === 1 ? "card" : "cards"} due
                  </p>
                  <p className="text-caption text-fg-muted">Say it out loud, it sticks</p>
                </div>
                <Button variant="ink" onClick={() => router.push("/learn")}>
                  Recall
                </Button>
              </div>
            )}
          </section>
        )}

        <Link href="/triage" className="press flex min-h-12 items-center gap-3 self-start rounded-full border border-line px-4 text-label text-fg">
          <Layers size={20} strokeWidth={2} aria-hidden />
          Sort old saves · 30 s
        </Link>
      </div>

      <Sheet open={lengthOpen} onClose={() => setLengthOpen(false)} label="Change length" title="How long today?">
        <div className="flex flex-col gap-4">
          <Segmented
            label="Queue length"
            options={LENGTH_OPTIONS}
            value={String(loop.settings.queueMinutes)}
            fullWidth
            onChange={(v) => {
              void loop.changeLength(Number(v));
              setLengthOpen(false);
            }}
          />
          <p className="text-caption text-fg-muted">Your queue rebuilds to fit. Stash remembers the length for tomorrow.</p>
        </div>
      </Sheet>

      <AskSheet
        open={askOpen}
        onClose={() => setAskOpen(false)}
        saves={lib.saves}
        thumbs={lib.thumbs}
        onOpenSave={(s) => {
          setAskOpen(false);
          router.push(`/item/${s.id}`);
        }}
      />

      <QuickSort
        open={sortOpen}
        onClose={() => setSortOpen(false)}
        items={unsorted}
        spaces={lib.spaces}
        thumbs={lib.thumbs}
        onFiled={(saveId, spaceId) => lib.patchSave(saveId, { spaceId })}
      />
    </PullToRefresh>
  );
}

/** Three thumbnails fanned like a little stack of cards. */
function StackPreview({ srcs }: { srcs: (string | undefined)[] }) {
  const rot = ["-rotate-12", "rotate-6", "rotate-0"];
  return (
    <span aria-hidden className="relative h-16 w-14 shrink-0">
      {srcs.map((src, i) => (
        <span key={i} className={cx("absolute inset-x-1 inset-y-0 overflow-hidden rounded-sm bg-raised ring-2 ring-surface", rot[i] ?? "")}>
          {src && (
            // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
            <img src={src} alt="" className="h-full w-full object-cover" />
          )}
        </span>
      ))}
    </span>
  );
}

function QueueThumb({ save, done, src, color, index }: { save: SaveItem; done: boolean; src?: string; color?: SpaceColor; index: number }) {
  return (
    <li className="rise-in relative aspect-9/16 overflow-hidden rounded-card bg-on-accent/15" style={{ animationDelay: `calc(var(--dur-press) * ${index} * 0.5)` }}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
        <img src={src} alt="" className={cx("absolute inset-0 h-full w-full object-cover", done && "opacity-40")} loading="lazy" />
      )}
      {color && <span aria-hidden className={cx("absolute inset-x-0 top-0 h-[var(--edge)]", SPACE_BG[color])} />}
      {done && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="pop-in flex h-9 w-9 items-center justify-center rounded-full bg-on-accent text-accent">
            <Check size={20} strokeWidth={3} aria-hidden />
          </span>
        </span>
      )}
      <span className="sr-only">
        {cardText(save)}
        {done ? ", done" : ""}
      </span>
    </li>
  );
}
