"use client";

import * as React from "react";

// One store for everything the reader chooses: accent, goal, layouts, the top tabs, the
// interface language, reading preferences, which stories were seen. Each pref lives in
// localStorage (instant, works offline) and on the server (so the phone and the desktop
// agree). Writes go to the device at once and to the server a moment later; on open and
// whenever the app comes back to the front, the server's newer values come down.

const META_KEY = "prefs-meta";
const SYNC_INTERVAL = 60_000;

type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();
const cache = new Map<string, unknown>();
let meta: Record<string, number> | null = null;
const pendingPush = new Set<string>();
let pushTimer: number | null = null;
let lastPull = 0;

/** The keys that follow the reader between devices. Everything else stays local. */
export const SYNCED = new Set([
  "personal",
  "accent",
  "reading-goal",
  "home-blocks",
  "start-view",
  "locale",
  "reader-prefs",
  "layouts",
  "stories-collapsed",
  "stories-seen",
  "comfort",
  "saved-searches",
]);

function readMeta(): Record<string, number> {
  if (meta) return meta;
  try {
    meta = JSON.parse(localStorage.getItem(META_KEY) || "{}") as Record<string, number>;
  } catch {
    meta = {};
  }
  return meta!;
}

function writeMeta() {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(readMeta()));
  } catch {
    // Fine.
  }
}

function parse(raw: string | null): unknown {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    // Values saved before the store existed were plain strings ("teal", "fr").
    return raw;
  }
}

/** The saved value, or the fallback. The same object comes back until it changes. */
export function readPref<T>(key: string, fallback: T): T {
  if (cache.has(key)) return cache.get(key) as T;
  let value: unknown;
  try {
    value = parse(localStorage.getItem(key));
  } catch {
    value = undefined;
  }
  const result = value === undefined ? fallback : (value as T);
  cache.set(key, result);
  return result;
}

function notify(key: string) {
  listeners.get(key)?.forEach((listener) => listener());
}

/** Save a value: the device now, the server shortly. */
export function writePref(key: string, value: unknown, at = Date.now()) {
  cache.set(key, value);
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or full: this visit only.
  }
  readMeta()[key] = at;
  writeMeta();
  notify(key);
  if (SYNCED.has(key)) schedulePush(key);
}

export function subscribePref(key: string, listener: Listener) {
  let set = listeners.get(key);
  if (!set) listeners.set(key, (set = new Set()));
  set.add(listener);
  return () => {
    set!.delete(listener);
  };
}

/**
 * A pref as React state, shared by every component that reads it. The server render and
 * the first client paint use the fallback; the saved value arrives with the first effect.
 */
export function usePref<T>(key: string, fallback: T): [T, (next: T | ((prev: T) => T)) => void] {
  const subscribe = React.useCallback((listener: Listener) => subscribePref(key, listener), [key]);
  const value = React.useSyncExternalStore(
    subscribe,
    () => readPref(key, fallback),
    () => fallback
  );
  const set = React.useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved =
        typeof next === "function" ? (next as (prev: T) => T)(readPref(key, fallback)) : next;
      writePref(key, resolved);
    },
    [key, fallback]
  );
  return [value, set];
}

// ---- Server sync ------------------------------------------------------------------------

interface Entry {
  v: unknown;
  at: number;
}

function schedulePush(key: string) {
  pendingPush.add(key);
  if (pushTimer !== null) window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => void push(), 800);
}

async function push() {
  pushTimer = null;
  if (pendingPush.size === 0 || !navigator.onLine) return;
  const entries: Record<string, Entry> = {};
  const keys = Array.from(pendingPush);
  for (const key of keys) {
    entries[key] = { v: readPref(key, null), at: readMeta()[key] ?? Date.now() };
  }
  try {
    const res = await fetch("/api/prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
      keepalive: true,
    });
    if (res.ok) for (const key of keys) pendingPush.delete(key);
  } catch {
    // Still pending: next change or next open sends it.
  }
}

/** Bring down what another device saved since; newer timestamps win on each key. */
export async function pull(force = false) {
  if (!navigator.onLine) return;
  if (!force && Date.now() - lastPull < SYNC_INTERVAL) return;
  lastPull = Date.now();
  let entries: Record<string, Entry> = {};
  try {
    const res = await fetch("/api/prefs");
    if (!res.ok) return;
    entries = ((await res.json()) as { entries?: Record<string, Entry> }).entries ?? {};
  } catch {
    return;
  }
  const local = readMeta();
  for (const [key, entry] of Object.entries(entries)) {
    if (!SYNCED.has(key) || !entry || typeof entry.at !== "number") continue;
    const mine = local[key] ?? 0;
    if (entry.at > mine) {
      cache.set(key, entry.v);
      try {
        localStorage.setItem(key, JSON.stringify(entry.v));
      } catch {
        // Fine.
      }
      local[key] = entry.at;
      notify(key);
    } else if (entry.at < mine) {
      // This device has the newer one; make sure the server gets it.
      pendingPush.add(key);
    }
  }
  // Keys only this device knows about go up too.
  for (const key of Array.from(SYNCED)) {
    if (!(key in entries) && key in local) pendingPush.add(key);
  }
  writeMeta();
  if (pendingPush.size > 0) void push();
}

/** Mount once (Providers): first pull, then on every return to the app and when back online. */
export function PrefsSync() {
  React.useEffect(() => {
    void pull(true);
    const onVisible = () => {
      if (document.visibilityState === "visible") void pull();
      else if (pendingPush.size > 0) void push();
    };
    const onOnline = () => {
      void push();
      void pull(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("pagehide", () => void push());
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, []);
  return null;
}
