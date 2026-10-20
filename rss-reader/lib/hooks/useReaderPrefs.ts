"use client";

import * as React from "react";
import { usePref } from "@/lib/prefs";

export type ReaderFont = "sans" | "serif" | "mono" | "dyslexic";
export type ReaderWidth = "narrow" | "normal" | "wide";
export type ReaderSpacing = "compact" | "normal" | "relaxed";

export interface ReaderPrefs {
  font: ReaderFont;
  size: 0 | 1 | 2 | 3;
  width: ReaderWidth;
  spacing: ReaderSpacing;
  /** Focus: just the text, no bars (and on desktop, no sidebar or list). */
  focus: boolean;
  /** A scroll (the default) or pages turned like a book. */
  mode: "scroll" | "pages";
}

const STORAGE_KEY = "reader-prefs";
const DEFAULTS: ReaderPrefs = {
  font: "sans",
  size: 1,
  width: "normal",
  spacing: "normal",
  focus: false,
  mode: "scroll",
};

export const READER_FONTS: Record<ReaderFont, string> = {
  sans: '"Inter Variable", Inter, ui-sans-serif, system-ui, sans-serif',
  serif: 'Charter, "Iowan Old Style", "Source Serif Pro", Georgia, Cambria, serif',
  mono: 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace',
  dyslexic: '"Atkinson Hyperlegible", "Comic Sans MS", "Comic Neue", Verdana, sans-serif',
};
export const READER_SIZES = [15, 17, 19, 21] as const;
export const READER_WIDTHS: Record<ReaderWidth, number> = { narrow: 600, normal: 700, wide: 820 };
export const READER_LEADING: Record<ReaderSpacing, number> = {
  compact: 1.55,
  normal: 1.7,
  relaxed: 1.9,
};

const merged = new WeakMap<object, ReaderPrefs>();

/** Reading preferences shared by every reader instance and every device. */
export function useReaderPrefs() {
  const [raw, setRaw] = usePref<Partial<ReaderPrefs>>(STORAGE_KEY, DEFAULTS);
  const prefs = React.useMemo(() => {
    if (!raw || typeof raw !== "object") return DEFAULTS;
    const hit = merged.get(raw);
    if (hit) return hit;
    const result = { ...DEFAULTS, ...raw };
    merged.set(raw, result);
    return result;
  }, [raw]);
  const update = React.useCallback(
    (patch: Partial<ReaderPrefs>) => setRaw((prev) => ({ ...DEFAULTS, ...(prev ?? {}), ...patch })),
    [setRaw]
  );
  return { prefs, update };
}
