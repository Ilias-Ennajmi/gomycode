"use client";

import * as React from "react";

export type ReaderFont = "sans" | "serif" | "mono";
export type ReaderWidth = "narrow" | "normal" | "wide";
export type ReaderSpacing = "compact" | "normal" | "relaxed";

export interface ReaderPrefs {
  font: ReaderFont;
  size: 0 | 1 | 2 | 3;
  width: ReaderWidth;
  spacing: ReaderSpacing;
}

const STORAGE_KEY = "reader-prefs";
const DEFAULTS: ReaderPrefs = { font: "sans", size: 1, width: "normal", spacing: "normal" };

export const READER_FONTS: Record<ReaderFont, string> = {
  sans: '"Inter Variable", Inter, ui-sans-serif, system-ui, sans-serif',
  serif: 'Charter, "Iowan Old Style", "Source Serif Pro", Georgia, Cambria, serif',
  mono: 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace',
};
export const READER_SIZES = [15, 17, 19, 21] as const;
export const READER_WIDTHS: Record<ReaderWidth, number> = { narrow: 600, normal: 700, wide: 820 };
export const READER_LEADING: Record<ReaderSpacing, number> = {
  compact: 1.55,
  normal: 1.7,
  relaxed: 1.9,
};

const listeners = new Set<() => void>();
let current: ReaderPrefs | null = null;

function read(): ReaderPrefs {
  if (current) return current;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    current = { ...DEFAULTS, ...(saved ?? {}) };
  } catch {
    current = DEFAULTS;
  }
  return current!;
}

/** Reading preferences shared by every reader instance, saved on this device. */
export function useReaderPrefs() {
  const prefs = React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => DEFAULTS
  );

  const update = React.useCallback((patch: Partial<ReaderPrefs>) => {
    current = { ...read(), ...patch };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
      // Private mode: preferences last for this visit only.
    }
    listeners.forEach((listener) => listener());
  }, []);

  return { prefs, update };
}
