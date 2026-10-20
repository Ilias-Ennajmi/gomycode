"use client";

import * as React from "react";
import { readPref, subscribePref, usePref } from "@/lib/prefs";

// The accent colour (buttons, rings, links), chosen in Settings and shared between devices.
// It's a data attribute on <html>; globals.css maps each one to --primary.

export const ACCENTS = [
  { id: "violet", label: "Violet", swatch: "#7c3aed" },
  { id: "blue", label: "Blue", swatch: "#2563eb" },
  { id: "teal", label: "Teal", swatch: "#0d9488" },
  { id: "green", label: "Green", swatch: "#16a34a" },
  { id: "amber", label: "Amber", swatch: "#d97706" },
  { id: "rose", label: "Rose", swatch: "#e11d48" },
  { id: "mono", label: "Ink", swatch: "#1f2937" },
] as const;
export type Accent = (typeof ACCENTS)[number]["id"];

const KEY = "accent";

function valid(value: unknown): Accent {
  return ACCENTS.some((a) => a.id === value) ? (value as Accent) : "violet";
}

export function readAccent(): Accent {
  return valid(readPref<string>(KEY, "violet"));
}

export function applyAccent(accent: Accent) {
  if (accent === "violet") delete document.documentElement.dataset.accent;
  else document.documentElement.dataset.accent = accent;
}

/** The chosen accent, applied whenever it changes (here or on another device). */
export function useAccent() {
  const [raw, setRaw] = usePref<string>(KEY, "violet");
  const accent = valid(raw);
  const setAccent = React.useCallback((next: Accent) => setRaw(next), [setRaw]);
  return { accent, setAccent };
}

/** Mount once (Providers): puts the saved accent on <html> and follows changes. */
export function AccentBoot() {
  React.useEffect(() => {
    applyAccent(readAccent());
    return subscribePref(KEY, () => applyAccent(readAccent()));
  }, []);
  return null;
}
