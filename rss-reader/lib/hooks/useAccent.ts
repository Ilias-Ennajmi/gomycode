"use client";

import * as React from "react";

// The accent colour (buttons, rings, links), chosen in Settings and kept on the device.
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

export function readAccent(): Accent {
  try {
    const saved = localStorage.getItem(KEY);
    return ACCENTS.some((a) => a.id === saved) ? (saved as Accent) : "violet";
  } catch {
    return "violet";
  }
}

export function applyAccent(accent: Accent) {
  if (accent === "violet") delete document.documentElement.dataset.accent;
  else document.documentElement.dataset.accent = accent;
}

/** The chosen accent, applied on mount and whenever it changes. */
export function useAccent() {
  const [accent, setAccentState] = React.useState<Accent>("violet");
  React.useEffect(() => {
    const saved = readAccent();
    setAccentState(saved);
    applyAccent(saved);
  }, []);
  const setAccent = React.useCallback((next: Accent) => {
    setAccentState(next);
    applyAccent(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // This visit only.
    }
  }, []);
  return { accent, setAccent };
}

/** Mount once (Providers): puts the saved accent on <html> before anything is tapped. */
export function AccentBoot() {
  React.useEffect(() => applyAccent(readAccent()), []);
  return null;
}
