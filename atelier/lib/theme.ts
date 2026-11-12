/*
 * Light / dark / system theme. The choice lives in localStorage (`atelier-theme`) and is applied
 * as data-theme on <html>. The inline script in app/layout.tsx runs it before first paint so the
 * page never flashes the wrong theme; everything here is the same logic for the running app.
 * Every storage and matchMedia access is guarded: both can be missing or blocked.
 */

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "atelier-theme";

/**
 * Brand colours for places that cannot read CSS variables (the web manifest, meta tags, the
 * offline page). They mirror styles/tokens.css; a test keeps them in step.
 */
export const BRAND = {
  /** Light canvas paper; also the splash background. */
  paper: "#F5F2EC",
  /** Dark canvas. */
  paperDark: "#121212",
  /** Ink, used for the installed app's title bar. */
  ink: "#141414",
} as const;

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function parseTheme(value: unknown): ThemePreference | null {
  return value === "light" || value === "dark" || value === "system" ? value : null;
}

/** What `system` means right now. False when the browser cannot tell. */
function systemPrefersDark(): boolean {
  try {
    return typeof matchMedia === "function" && matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

export function resolveTheme(pref: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (pref === "system") return prefersDark ? "dark" : "light";
  return pref;
}

/** The saved preference; `system` when nothing valid is saved or storage is unavailable. */
export function getTheme(): ThemePreference {
  try {
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY)) ?? "system";
  } catch {
    return "system";
  }
}

/** Put the theme on <html> and return what was applied. */
export function applyTheme(pref: ThemePreference = getTheme(), root: HTMLElement = document.documentElement): ResolvedTheme {
  const theme = resolveTheme(pref, systemPrefersDark());
  root.dataset.theme = theme;
  return theme;
}

/** Save a choice (best effort) and apply it. */
export function setTheme(pref: ThemePreference): ResolvedTheme {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* not saved: it still applies for this visit */
  }
  return applyTheme(pref);
}

/** While the preference is `system`, follow the operating system when it switches. Returns the stop function. */
export function watchSystemTheme(): () => void {
  let query: MediaQueryList | null = null;
  try {
    query = typeof matchMedia === "function" ? matchMedia(DARK_QUERY) : null;
  } catch {
    query = null;
  }
  if (!query) return () => {};
  const onChange = () => {
    if (getTheme() === "system") applyTheme("system");
  };
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Inline script for <head>: runs before first paint. Mirrors getTheme + applyTheme on purpose in
 * plain ES5 (it must not depend on the app bundle). A missing storage or matchMedia degrades
 * to the system theme or light, never to a thrown error.
 */
export const THEME_INIT_SCRIPT = `(function(){var t=null;try{t=localStorage.getItem("${THEME_STORAGE_KEY}")}catch(e){}var d=false;try{d=t==="dark"||(t!=="light"&&matchMedia("${DARK_QUERY}").matches)}catch(e){}document.documentElement.dataset.theme=d?"dark":"light"})()`;
