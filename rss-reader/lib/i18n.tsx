"use client";

import * as React from "react";
import { readPref, usePref } from "@/lib/prefs";

// The interface in English or French. Article text stays in its own language; this covers
// the chrome: tabs, the sidebar, settings, list menus and the common actions. Strings not in
// the French table fall back to English, so a missing translation is never a blank.

export type Locale = "en" | "fr";
const KEY = "locale";

// French is a separate chunk: English readers never download it.
let french: Record<string, string> | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
function loadFrench() {
  loading ??= import("@/lib/i18n-fr").then((module) => {
    french = module.FR;
    listeners.forEach((listener) => listener());
  });
  return loading;
}

const LocaleContext = React.createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (text: string) => string;
}>({ locale: "en", setLocale: () => {}, t: (text) => text });

export function readLocale(): Locale {
  return readPref<string>(KEY, "en") === "fr" ? "fr" : "en";
}

/** Outside components (toasts, helpers): the same lookup, read from the saved locale. */
export function tr(text: string) {
  if (readLocale() !== "fr") return text;
  if (!french) void loadFrench();
  return french?.[text] ?? text;
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [raw, setRaw] = usePref<string>(KEY, "en");
  const locale: Locale = raw === "fr" ? "fr" : "en";
  // Bumped when the French table arrives, so the screen redraws in French.
  const [loaded, setLoaded] = React.useState(Boolean(french));
  React.useEffect(() => {
    document.documentElement.lang = locale;
    if (locale !== "fr" || french) return;
    const done = () => setLoaded(true);
    listeners.add(done);
    void loadFrench();
    return () => {
      listeners.delete(done);
    };
  }, [locale]);
  const setLocale = React.useCallback((next: Locale) => setRaw(next), [setRaw]);
  const t = React.useCallback(
    (text: string) => (locale === "fr" ? (french?.[text] ?? text) : text),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, loaded]
  );
  const value = React.useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
export function useT() {
  return React.useContext(LocaleContext);
}
