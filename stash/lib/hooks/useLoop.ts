"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { useLibrary } from "@/lib/hooks/useLibrary";
import { localDay, shouldStoreQueue } from "@/lib/dailyQueue";
import { setDueFlag } from "@/lib/dueFlag";
import { daysThisWeek, streak } from "@/lib/streak";
import { dueToday } from "@/lib/sm2";
import {
  buildForDay,
  fetchDailyQueue,
  fetchDueCards,
  fetchFiredReminders,
  fetchLoopSettings,
  fetchReviewsSince,
  fetchSyntheses,
  readLoopSettings,
  saveLoopSettings,
  storeDailyQueue,
  type DailyQueue,
  type FiredReminder,
  type LoopSettings,
  type RecallCard,
  type Review,
  type SynthesisItem,
} from "@/lib/loop";

const CACHE = "stash.loop";
type Cached = { queue: DailyQueue | null; syntheses: SynthesisItem[]; reviews: Review[] };

function readCache(): Cached | null {
  try {
    return JSON.parse(localStorage.getItem(CACHE) ?? "null") as Cached | null;
  } catch {
    return null;
  }
}

/**
 * Everything Today and Learn need, on top of the library: today's queue (built
 * here when the cron hasn't yet), due recall cards of kept saves, recent
 * reviews (streak, daily cap), syntheses and reminders that fired.
 */
export function useLoop() {
  const lib = useLibrary();
  const [settings, setSettings] = useState<LoopSettings>(() => readLoopSettings());
  const [queue, setQueue] = useState<DailyQueue | null>(null);
  const [cards, setCards] = useState<RecallCard[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [syntheses, setSyntheses] = useState<SynthesisItem[]>([]);
  const [reminders, setReminders] = useState<FiredReminder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [day, setDay] = useState("");
  const building = useRef(false);

  const load = useCallback(async () => {
    const today = localDay();
    setDay(today);
    if (!getBrowserClient()) {
      setLoaded(true);
      return;
    }
    try {
      const since = new Date(Date.now() - 60 * 86_400_000);
      const [s, q, c, r, sy, rem] = await Promise.all([
        fetchLoopSettings(),
        fetchDailyQueue(today),
        fetchDueCards(),
        fetchReviewsSince(since),
        fetchSyntheses(),
        fetchFiredReminders(),
      ]);
      setSettings(s);
      setQueue(q);
      setCards(c);
      setReviews(r);
      setSyntheses(sy);
      setReminders(rem);
      try {
        localStorage.setItem(CACHE, JSON.stringify({ queue: q, syntheses: sy, reviews: r.slice(0, 100) }));
      } catch {
        // cache is a convenience only
      }
    } catch {
      // Offline or not set up: the cached copy stays on screen.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    const cached = readCache();
    if (cached) {
      // localStorage is only readable after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (cached.queue?.day === localDay()) setQueue(cached.queue);
      setSyntheses(cached.syntheses ?? []);
      setReviews(cached.reviews ?? []);
    }
    void load();
    const supabase = getBrowserClient();
    const channel = supabase
      ?.channel(`stash-loop-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "stash", table: "daily_queues" }, () => void load())
      .on("postgres_changes", { event: "INSERT", schema: "stash", table: "syntheses" }, () => void load())
      .subscribe();
    return () => {
      if (channel) void supabase?.removeChannel(channel);
    };
  }, [load]);

  const savesById = useMemo(() => new Map(lib.saves.map((s) => [s.id, s])), [lib.saves]);

  // Cards of kept saves only ("kept saves turn into recall cards").
  const keptCards = useMemo(() => cards.filter((c) => savesById.get(c.saveId)?.kept), [cards, savesById]);
  const answeredToday = useMemo(() => {
    const today = localDay();
    return new Set(reviews.filter((r) => localDay(new Date(r.answeredAt)) === today).map((r) => r.cardId)).size;
  }, [reviews]);
  const dueCards = useMemo(() => dueToday(keptCards, answeredToday), [keptCards, answeredToday]);

  const activeDays = useMemo(() => {
    const days = new Set<string>();
    for (const s of lib.saves) if (s.watchedAt) days.add(localDay(new Date(s.watchedAt)));
    for (const r of reviews) days.add(localDay(new Date(r.answeredAt)));
    return days;
  }, [lib.saves, reviews]);
  const today = day || localDay();
  const streakDays = streak(activeDays, today);
  const weekDays = daysThisWeek(activeDays, today);

  const dueSaveIds = useMemo(() => new Set(keptCards.map((c) => c.saveId)), [keptCards]);

  const rebuild = useCallback(
    async (minutes?: number) => {
      const m = minutes ?? settings.queueMinutes;
      const d = localDay();
      const ids = buildForDay(lib.saves, lib.spaces, dueSaveIds, d, m);
      setQueue((prev) => ({ day: d, saveIds: ids, doneIds: prev?.day === d ? prev.doneIds : [], minutes: m }));
      // Nothing ready yet but saves still processing: show it, don't freeze the day empty.
      if (!shouldStoreQueue(ids, lib.saves.map((s) => s.status))) return ids;
      try {
        await storeDailyQueue(d, ids, m);
      } catch {
        // Kept on screen; the next load or the cron stores it.
      }
      return ids;
    },
    [lib.saves, lib.spaces, dueSaveIds, settings.queueMinutes],
  );

  // No queue for today yet (the cron runs at the owner's queue time): build it here.
  useEffect(() => {
    if (!loaded || !lib.synced || queue || building.current || lib.saves.length === 0 || !getBrowserClient()) return;
    building.current = true;
    void rebuild().finally(() => {
      building.current = false;
    });
  }, [loaded, lib.synced, lib.saves.length, queue, rebuild]);

  const changeLength = useCallback(
    async (minutes: number) => {
      setSettings((s) => ({ ...s, queueMinutes: minutes }));
      void saveLoopSettings({ queueMinutes: minutes }).catch(() => {});
      await rebuild(minutes);
    },
    [rebuild],
  );

  // Queue items still playable (a save may have been archived or deleted since).
  const queueItems = useMemo(
    () => (queue?.saveIds ?? []).map((id) => savesById.get(id)).filter((s): s is NonNullable<typeof s> => Boolean(s && !s.archivedAt)),
    [queue, savesById],
  );
  const doneCount = queueItems.filter((s) => queue?.doneIds.includes(s.id)).length;
  const hasDue = queueItems.length > doneCount || dueCards.length > 0;

  useEffect(() => {
    if (loaded) setDueFlag(hasDue);
  }, [loaded, hasDue]);

  return {
    lib,
    day: today,
    settings,
    setSettings,
    queue,
    queueItems,
    doneCount,
    dueCards,
    answeredToday,
    reviews,
    setReviews,
    setCards,
    syntheses,
    reminders,
    streak: streakDays,
    weekDays,
    loaded,
    reload: load,
    rebuild,
    changeLength,
  };
}
