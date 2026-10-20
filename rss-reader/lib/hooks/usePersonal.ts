"use client";

import * as React from "react";
import type { ViewType } from "@/lib/hooks/useReaderState";

// Settings → Personalise: the small switches and the tab bar's order, kept on the device in
// one JSON blob. A tiny store so every reader of a switch re-renders when it flips.

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
  /** The top tabs in order; hidden ones are left out of the bar. */
  tabs: ViewType[];
  hiddenTabs: ViewType[];
  /** Category ids pinned as tabs after the built-in ones. */
  pinnedCategories: string[];
}

const KEY = "personal";
const EVENT = "reader:personal";
const DEFAULT: Personal = {
  stories: true,
  ring: true,
  briefingCard: true,
  density: "comfortable",
  haptics: true,
  tabs: TAB_TYPES,
  hiddenTabs: [],
  pinnedCategories: [],
};

let current: Personal | null = null;

function load(): Personal {
  if (current) return current;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<Personal>;
    const tabs = (saved.tabs ?? []).filter((t) => TAB_TYPES.includes(t));
    for (const t of TAB_TYPES) if (!tabs.includes(t)) tabs.push(t);
    current = {
      ...DEFAULT,
      ...saved,
      tabs,
      hiddenTabs: (saved.hiddenTabs ?? []).filter((t) => TAB_TYPES.includes(t)),
      pinnedCategories: saved.pinnedCategories ?? [],
    };
  } catch {
    current = DEFAULT;
  }
  return current;
}

function save(next: Personal) {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // This visit only.
  }
  applyDensity(next.density);
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function applyDensity(density: Personal["density"]) {
  if (density === "compact") document.documentElement.dataset.density = "compact";
  else delete document.documentElement.dataset.density;
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

/** The personal switches, live. Server render and the first paint use the defaults. */
export function usePersonal() {
  const personal = React.useSyncExternalStore(subscribe, load, () => DEFAULT);
  const update = React.useCallback(
    (changes: Partial<Personal>) => save({ ...load(), ...changes }),
    []
  );
  return { personal, update };
}

/** Haptics switch, readable without React (lib/native). */
export function hapticsEnabled() {
  try {
    return load().haptics;
  } catch {
    return true;
  }
}

/** Mount once (Providers): puts the density on <html> before anything is tapped. */
export function PersonalBoot() {
  React.useEffect(() => applyDensity(load().density), []);
  return null;
}
