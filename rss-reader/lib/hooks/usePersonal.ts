"use client";

import * as React from "react";
import type { ViewType } from "@/lib/hooks/useReaderState";
import { readPref, subscribePref, usePref } from "@/lib/prefs";

// Settings → Personalise: the small switches and the tab bar's order, one JSON blob in the
// shared preference store (so the phone and the desktop agree).

export const TAB_TYPES: ViewType[] = [
  "foryou",
  "news",
  "rss",
  "youtube",
  "newsletters",
  "podcasts",
  "later",
];

export interface Personal {
  /** The stories row above lists. */
  stories: boolean;
  /** The reading-goal ring on For You and Today. */
  ring: boolean;
  /** The briefing card at the top of For You. */
  briefingCard: boolean;
  density: "comfortable" | "compact";
  haptics: boolean;
  /** A sideways swipe on a list: move to the next tab, or act on the card (Later / read). */
  listSwipe: "tabs" | "actions";
  /** The top tabs in order; hidden ones are left out of the bar. */
  tabs: ViewType[];
  hiddenTabs: ViewType[];
  /** Category ids pinned as tabs after the built-in ones. */
  pinnedCategories: string[];
}

const KEY = "personal";
const EMPTY: Partial<Personal> = {};
export const DEFAULT_PERSONAL: Personal = {
  stories: true,
  ring: true,
  briefingCard: true,
  density: "comfortable",
  haptics: true,
  listSwipe: "tabs",
  tabs: TAB_TYPES,
  hiddenTabs: [],
  pinnedCategories: [],
};

const normalised = new WeakMap<object, Personal>();

function normalise(saved: Partial<Personal>): Personal {
  const hit = normalised.get(saved);
  if (hit) return hit;
  const tabs = (saved.tabs ?? []).filter((t) => TAB_TYPES.includes(t));
  for (const t of TAB_TYPES) if (!tabs.includes(t)) tabs.push(t);
  const result: Personal = {
    ...DEFAULT_PERSONAL,
    ...saved,
    tabs,
    hiddenTabs: (saved.hiddenTabs ?? []).filter((t) => TAB_TYPES.includes(t)),
    pinnedCategories: saved.pinnedCategories ?? [],
  };
  normalised.set(saved, result);
  return result;
}

function load(): Personal {
  const saved = readPref<Partial<Personal>>(KEY, EMPTY);
  return normalise(saved && typeof saved === "object" ? saved : EMPTY);
}

export function applyDensity(density: Personal["density"]) {
  if (density === "compact") document.documentElement.dataset.density = "compact";
  else delete document.documentElement.dataset.density;
}

/** The personal switches, live. Server render and the first paint use the defaults. */
export function usePersonal() {
  const [raw, setRaw] = usePref<Partial<Personal>>(KEY, EMPTY);
  const personal = React.useMemo(
    () => normalise(raw && typeof raw === "object" ? raw : EMPTY),
    [raw]
  );
  const update = React.useCallback(
    (changes: Partial<Personal>) => setRaw({ ...load(), ...changes }),
    [setRaw]
  );
  return { personal, update };
}

/** Haptics switch, readable without React (lib/native). */
/** Cards act on a sideways swipe (Later / read) instead of it moving between tabs. */
export function cardSwipeActions() {
  return load().listSwipe === "actions";
}

export function hapticsEnabled() {
  try {
    return load().haptics;
  } catch {
    return true;
  }
}

/** Mount once (Providers): keeps the density on <html>, including when it syncs in. */
export function PersonalBoot() {
  React.useEffect(() => {
    applyDensity(load().density);
    return subscribePref(KEY, () => applyDensity(load().density));
  }, []);
  return null;
}
