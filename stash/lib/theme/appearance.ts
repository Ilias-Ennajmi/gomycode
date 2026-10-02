// Appearance preferences: the shape, defaults, and how they're applied to <html>.
// Applying is synchronous and local (instant restyle, no reload); syncing to
// Supabase happens afterwards in ThemeProvider.

export const THEMES = ["system", "dark", "light", "black"] as const;
export type ThemePref = (typeof THEMES)[number];
export type ResolvedTheme = Exclude<ThemePref, "system">;

export const ACCENTS = ["lime", "coral", "sky", "gold", "mono", "custom"] as const;
export type AccentPref = (typeof ACCENTS)[number];

export type Appearance = {
  theme: ThemePref;
  accent: AccentPref;
  /** #rrggbb, only when accent === "custom" */
  accentCustom: string | null;
  /** ink computed for the custom accent (contrast.ts), stored so first paint is right */
  onAccentCustom: string | null;
  textScale: number; // 0.9 – 1.3
  density: 2 | 3;
  reduceMotion: boolean;
  haptics: boolean;
  /** ms epoch of the last local change, to reconcile with the Supabase row */
  updatedAt: number;
};

export const DEFAULT_APPEARANCE: Appearance = {
  theme: "system",
  accent: "lime",
  accentCustom: null,
  onAccentCustom: null,
  textScale: 1,
  density: 2,
  reduceMotion: false,
  haptics: true,
  updatedAt: 0,
};

export const STORAGE_KEY = "stash.appearance";

export function clampScale(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(1.3, Math.max(0.9, Math.round(n * 100) / 100));
}

/** Validates anything read from storage or the network into a full Appearance. */
export function normalize(input: unknown): Appearance {
  const v = (input && typeof input === "object" ? input : {}) as Partial<Appearance>;
  const hex = (s: unknown) => (typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : null);
  const accent = ACCENTS.includes(v.accent as AccentPref) ? (v.accent as AccentPref) : "lime";
  const accentCustom = hex(v.accentCustom);
  return {
    theme: THEMES.includes(v.theme as ThemePref) ? (v.theme as ThemePref) : "system",
    accent: accent === "custom" && !accentCustom ? "lime" : accent,
    accentCustom,
    onAccentCustom: hex(v.onAccentCustom),
    textScale: clampScale(typeof v.textScale === "number" ? v.textScale : 1),
    density: v.density === 3 ? 3 : 2,
    reduceMotion: v.reduceMotion === true,
    haptics: v.haptics !== false,
    updatedAt: typeof v.updatedAt === "number" ? v.updatedAt : 0,
  };
}

export function resolveTheme(pref: ThemePref, systemDark: boolean): ResolvedTheme {
  if (pref === "system") return systemDark ? "dark" : "light";
  return pref;
}

export function readStored(): Appearance {
  try {
    return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function writeStored(a: Appearance): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
  } catch {
    // Private mode or storage full: the choice still applies for this session.
  }
}

/** Applies an appearance to <html>. Instant: only attributes and CSS variables change. */
export function applyAppearance(a: Appearance, root: HTMLElement = document.documentElement): void {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = resolveTheme(a.theme, systemDark);
  root.dataset.themePref = a.theme;
  root.dataset.accent = a.accent;
  root.dataset.density = String(a.density);
  root.dataset.reduceMotion = String(a.reduceMotion);
  root.style.setProperty("--text-scale", String(a.textScale));
  if (a.accent === "custom" && a.accentCustom) {
    root.style.setProperty("--accent-pick", a.accentCustom);
    root.style.setProperty("--on-accent-pick", a.onAccentCustom ?? "var(--ink-dark)");
  } else {
    root.style.removeProperty("--accent-pick");
    root.style.removeProperty("--on-accent-pick");
  }
  // Status bar colour follows the resolved background.
  const bg = getComputedStyle(root).getPropertyValue("--background").trim();
  if (bg) {
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", bg));
  }
}

/**
 * Runs inline in <head> before first paint, so the page never flashes the wrong
 * theme. Kept dependency-free and tiny; mirrors applyAppearance minus meta tags
 * (CSS isn't parsed yet at that point; ThemeProvider updates them on mount).
 */
export const PREPAINT_SCRIPT = `(function(){try{var d=document.documentElement,a=JSON.parse(localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)})||"{}")||{},t=a.theme||"system";if(t==="system")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";d.dataset.theme=t;d.dataset.themePref=a.theme||"system";d.dataset.accent=a.accent||"lime";d.dataset.density=String(a.density||2);d.dataset.reduceMotion=String(!!a.reduceMotion);if(a.textScale)d.style.setProperty("--text-scale",String(a.textScale));if(a.accent==="custom"&&a.accentCustom){d.style.setProperty("--accent-pick",a.accentCustom);if(a.onAccentCustom)d.style.setProperty("--on-accent-pick",a.onAccentCustom)}}catch(e){}})();`;
