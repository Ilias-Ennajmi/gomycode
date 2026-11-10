"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { applySaveRow, fetchSaves, fetchSpaces, type SaveItem, type SaveRow, type Space } from "@/lib/data";
import { flush, onOutboxChange, pending, type OutboxItem } from "@/lib/outbox";
import { signedUrls } from "@/lib/media";
import { isPendingDelete, onPendingDeleteChange } from "@/lib/undo";

const CACHE = "stash.library";

type Cached = { saves: SaveItem[]; spaces: Space[] };

function readCache(): Cached | null {
  try {
    return JSON.parse(localStorage.getItem(CACHE) ?? "null") as Cached | null;
  } catch {
    return null;
  }
}

/**
 * Everything the Library, Play and Space screens need: saves, Spaces, saves
 * still waiting in the outbox, and thumbnail URLs. Live: a processed save
 * fills in through Supabase Realtime. Renders from the last copy instantly.
 */
export function useLibrary() {
  const [saves, setSaves] = useState<SaveItem[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [queued, setQueued] = useState<OutboxItem[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  // True once the first network refresh has answered (or failed offline): the cache may be stale before that.
  const [synced, setSynced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Saves that finished processing while on screen: their key idea fades in.
  const [justReady, setJustReady] = useState<Set<string>>(new Set());
  const statuses = useRef(new Map<string, string>());
  const [deletes, setDeletes] = useState(0);

  useEffect(() => onPendingDeleteChange(() => setDeletes((n) => n + 1)), []);

  const loadThumbs = useCallback(async (items: SaveItem[]) => {
    const paths = items.map((s) => s.thumbPath).filter((p): p is string => Boolean(p));
    if (!paths.length) return;
    const urls = await signedUrls("stash-thumbs", paths);
    setThumbs((prev) => ({ ...prev, ...urls }));
  }, []);

  const refresh = useCallback(async () => {
    setQueued(await pending());
    try {
      const [sv, sp] = await Promise.all([fetchSaves(), fetchSpaces()]);
      const ready = new Set<string>();
      for (const s of sv) {
        const before = statuses.current.get(s.id);
        if (before && before !== "ready" && s.status === "ready") ready.add(s.id);
        statuses.current.set(s.id, s.status);
      }
      if (ready.size) setJustReady((prev) => new Set([...prev, ...ready]));
      setSaves(sv);
      setSpaces(sp);
      setError(null);
      try {
        localStorage.setItem(CACHE, JSON.stringify({ saves: sv.slice(0, 200), spaces: sp }));
      } catch {
        // cache is a convenience only
      }
      void loadThumbs(sv);
    } catch {
      setError(navigator.onLine ? "Couldn't load your saves." : null);
    } finally {
      setLoading(false);
      setSynced(true);
    }
  }, [loadThumbs]);

  useEffect(() => {
    const cached = readCache();
    if (cached) {
      // Local cache is only readable after mount (SSR has no localStorage), so it's applied here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSaves(cached.saves);
      setSpaces(cached.spaces);
      cached.saves.forEach((s) => statuses.current.set(s.id, s.status));
      setLoading(false);
      void loadThumbs(cached.saves);
    }
    void flush().then(refresh);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 400);
    };
    const offOutbox = onOutboxChange(soon);
    const online = () => void flush().then(refresh);
    window.addEventListener("online", online);

    // Live progress: a save's own columns (step, title, picture, player) are folded in the moment
    // the change arrives; the full refresh that follows brings the insights.
    const onSave = (payload: { eventType?: string; new?: unknown }) => {
      const row = payload.new as (Partial<SaveRow> & { id?: string }) | undefined;
      if (payload.eventType === "UPDATE" && row?.id) {
        setSaves((prev) => prev.map((s) => (s.id === row.id ? applySaveRow(s, row) : s)));
        if (row.thumb_path) void signedUrls("stash-thumbs", [row.thumb_path]).then((urls) => setThumbs((prev) => ({ ...prev, ...urls })));
      }
      soon();
    };

    const supabase = getBrowserClient();
    const channel = supabase
      ?.channel(`stash-library-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "stash", table: "saves" }, onSave)
      .on("postgres_changes", { event: "*", schema: "stash", table: "insights" }, soon)
      .on("postgres_changes", { event: "*", schema: "stash", table: "states" }, soon)
      .subscribe();

    return () => {
      clearTimeout(timer);
      offOutbox();
      window.removeEventListener("online", online);
      if (channel) void supabase?.removeChannel(channel);
    };
  }, [refresh, loadThumbs]);

  /** Optimistic local change; the caller writes to the server. */
  const patchSave = useCallback((id: string, patch: Partial<SaveItem>) => {
    setSaves((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const removeSave = useCallback((id: string) => {
    setSaves((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // Saves inside their Undo window are hidden everywhere.
  const shown = useMemo(() => saves.filter((s) => !isPendingDelete(s.id)), [saves, deletes]); // eslint-disable-line react-hooks/exhaustive-deps

  return { saves: shown, spaces, queued, thumbs, loading, synced, error, justReady, refresh, patchSave, removeSave, setSpaces };
}
