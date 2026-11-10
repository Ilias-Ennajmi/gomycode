"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, Download, Flame, Inbox, Layers, Play, RefreshCw, Share2, Timer, User } from "lucide-react";
import { AiLabel } from "@/components/ui/AiLabel";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressSegments } from "@/components/ui/ProgressSegments";
import { Segmented } from "@/components/ui/Segmented";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { cx } from "@/components/ui/cx";
import { SPACE_BG, type SpaceColor } from "@/components/ui/space";
import { cardText } from "@/components/library/SaveGrid";
import { PullToRefresh } from "@/components/today/PullToRefresh";
import { QuickSort } from "@/components/today/QuickSort";
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

type ForYou =
  | { kind: "pattern"; id: string; title: string; text: string; href: string }
  | { kind: "reminder"; id: string; title: string; text: string; href: string }
  | { kind: "again"; id: string; title: string; text: string; href: string };
// Phase 3 adds { kind: "nearby" } here: a saved place close to where the phone is.

export function TodayView() {
  const router = useRouter();
  const loop = useLoop();
  const { lib } = loop;
  const initial = useInitial();
  const [lengthOpen, setLengthOpen] = useState(false);
  const [nearbyShown, setNearbyShown] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

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
      out.push({ kind: "pattern", id: syn.id, title: space?.name ?? syn.topic ?? "Your saves", text: syn.points[0], href: "/learn#syntheses" });
    }
    for (const r of loop.reminders.slice(0, 2)) {
      const s = savesById.get(r.saveId);
      if (s && !s.archivedAt) out.push({ kind: "reminder", id: r.id, title: "Reminder", text: cardText(s), href: `/item/${s.id}` });
    }
    // An old save worth another look, picked per day so it changes daily but not on every visit.
    const cutoff = Date.parse(`${loop.day}T00:00:00`) - OLD_DAYS * 86_400_000;
    const queued = new Set(loop.queue?.saveIds ?? []);
    const old = lib.saves.filter(
      (s) => !s.archivedAt && !queued.has(s.id) && Date.parse(s.savedAt) < cutoff && (s.kept || !s.watchedAt) && s.status === "ready",
    );
    if (old.length) {
      const pick = old[hashString(loop.day) % old.length];
      out.push({ kind: "again", id: pick.id, title: "Worth another look", text: cardText(pick), href: `/item/${pick.id}` });
    }
    return out.slice(0, 5);
  }, [loop.syntheses, loop.reminders, loop.queue, loop.day, lib.saves, savesById, spacesById]);

  const firstLoad = !loop.loaded || (lib.loading && lib.saves.length === 0);
  const empty = !firstLoad && lib.synced && lib.saves.length === 0 && lib.queued.length === 0;

  const header = (
    <header className="flex items-start justify-between gap-4 px-4 pt-6 pb-4">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-caption text-fg-muted" suppressHydrationWarning>
          {loop.day ? new Date(`${loop.day}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : ""}
        </p>
        <h1 className="text-display">Today</h1>
        <div className="flex items-center gap-3">
          <ProgressSegments total={WEEK_GOAL} filled={loop.weekDays} accent label={`${Math.min(loop.weekDays, WEEK_GOAL)} of ${WEEK_GOAL} this week`} className="max-w-40" />
          <span className="shrink-0 text-caption text-fg-muted">
            {Math.min(loop.weekDays, WEEK_GOAL)} of {WEEK_GOAL} this week
          </span>
        </div>
      </div>
      <Link href="/you" aria-label="You" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-raised text-label text-fg">
        {initial ?? <User size={24} strokeWidth={2} aria-hidden />}
      </Link>
    </header>
  );

  if (empty) {
    return (
      <>
        {header}
        <EmptyState
          icon={Share2}
          message="Share a reel to Stash to start. Your 5 for today builds from what you save."
          actionLabel="Paste a link"
          onAction={() => router.push("/library?paste=1")}
        />
        <p className="px-6 text-center">
          <Link href="/import" className="tap inline-flex items-center justify-center gap-2 px-4 text-label text-fg underline">
            <Download size={20} strokeWidth={2} aria-hidden />
            Bring the saves you already have
          </Link>
        </p>
      </>
    );
  }

  return (
    <PullToRefresh onRefresh={async () => {
      await lib.refresh();
      await loop.rebuild();
    }}>
      {header}
      <div className="flex flex-col gap-6 px-4 pb-6">
        {/* Hero: accent = act now. */}
        {firstLoad ? (
          <Skeleton shape="block" className="h-64 rounded-xl" />
        ) : (
          <section aria-labelledby="hero-title" className="flex flex-col gap-4 rounded-xl bg-accent p-5 text-on-accent">
            <div className="flex items-start justify-between gap-3">
              <h2 id="hero-title" className="text-title">
                {allDone ? `All ${items.length} done` : `Your ${items.length || 5} for today`}
              </h2>
              {loop.streak > 0 && (
                <span className="flex shrink-0 items-center gap-1 text-label" aria-label={`${loop.streak}-day streak`}>
                  <Flame size={20} strokeWidth={2} aria-hidden /> {loop.streak}
                </span>
              )}
            </div>
            {items.length > 0 ? (
              <ul className="grid grid-cols-5 gap-2" aria-label="Today's queue">
                {items.slice(0, 5).map((s) => (
                  <QueueThumb key={s.id} save={s} done={done.has(s.id)} src={s.thumbPath ? lib.thumbs[s.thumbPath] : undefined} color={s.spaceId ? spacesById.get(s.spaceId)?.color : undefined} />
                ))}
              </ul>
            ) : (
              <p className="text-body">Your queue fills in once a save finishes processing.</p>
            )}
            {items.length > 5 && <p className="text-caption">+ {items.length - 5} more</p>}
            <div className="flex flex-wrap gap-2">
              {allDone ? (
                <Button variant="on-accent" icon={Play} onClick={() => router.push("/learn")}>
                  Start recall
                </Button>
              ) : (
                <Button variant="on-accent" icon={Play} disabled={!items.length} onClick={() => router.push("/play?queue=today")}>
                  Start · {minutes} min
                </Button>
              )}
              <button
                type="button"
                onClick={() => setLengthOpen(true)}
                className="inline-flex h-12 items-center gap-2 rounded-card border border-on-accent/40 px-4 text-label text-on-accent active:scale-95"
              >
                <Timer size={20} strokeWidth={2} aria-hidden />
                Change length
              </button>
            </div>
          </section>
        )}

        {/* The section stays mounted so the Place-nearby card can look for a place; hidden while empty. */}
        <section aria-labelledby="for-you" className={cx("flex flex-col gap-3", forYou.length === 0 && !nearbyShown && "hidden")}>
          <h2 id="for-you" className="text-heading">
            For you
          </h2>
          <ul className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4">
            <li className={cx("w-4/5 shrink-0 snap-start", !nearbyShown && "hidden")}>
              <NearbyCard className="h-full" onShow={setNearbyShown} />
            </li>
            {forYou.slice(0, nearbyShown ? 4 : 5).map((f) => (
              <li key={`${f.kind}-${f.id}`} className="w-4/5 shrink-0 snap-start">
                <Link href={f.href} className="block h-full">
                  <Card size="lg" className="flex h-full flex-col gap-2">
                    {f.kind === "pattern" ? (
                      <AiLabel text="Pattern spotted" />
                    ) : (
                      <span className="flex items-center gap-2 text-label text-fg-muted">
                        {f.kind === "reminder" ? <Bell size={20} strokeWidth={2} aria-hidden /> : <RefreshCw size={20} strokeWidth={2} aria-hidden />}
                        {f.title}
                      </span>
                    )}
                    {f.kind === "pattern" && <span className="text-caption text-fg-muted">{f.title}</span>}
                    <p className="line-clamp-3 text-body">{f.text}</p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {unsorted.length > 0 && (
          <Card size="lg" className="flex items-center gap-3">
            <Inbox size={24} strokeWidth={2} aria-hidden className="shrink-0 text-fg-muted" />
            <p className="min-w-0 flex-1 text-body">
              {unsorted.length} {unsorted.length === 1 ? "save" : "saves"} in your Inbox
            </p>
            <Button variant="secondary" onClick={() => setSortOpen(true)}>
              Quick sort · 30 s
            </Button>
          </Card>
        )}

        {loop.dueCards.length > 0 && (
          <Card size="lg" className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-body">
              {loop.dueCards.length} recall {loop.dueCards.length === 1 ? "card" : "cards"} due
            </p>
            <Button variant="secondary" onClick={() => router.push("/learn")}>
              Recall
            </Button>
          </Card>
        )}

        <Link href="/triage" className="flex min-h-12 items-center gap-3 self-start rounded-card px-1 text-label text-fg-muted">
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

function QueueThumb({ save, done, src, color }: { save: SaveItem; done: boolean; src?: string; color?: SpaceColor }) {
  return (
    <li className="relative aspect-9/16 overflow-hidden rounded-sm bg-on-accent/15">
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
        <img src={src} alt="" className={cx("absolute inset-0 h-full w-full object-cover", done && "opacity-40")} loading="lazy" />
      )}
      {color && <span aria-hidden className={cx("absolute inset-x-0 top-0 h-0.75", SPACE_BG[color])} />}
      {done && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-on-accent text-accent">
            <Check size={20} strokeWidth={2} aria-hidden />
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
