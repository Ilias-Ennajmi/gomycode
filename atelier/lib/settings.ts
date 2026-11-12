/**
 * Navigation preferences, kept per device in localStorage. Every read and write is guarded: storage can be missing
 * (server render, private mode, blocked site data) and the app must keep working on the defaults.
 */
export type NavSettings = {
  /** What a mouse wheel does when behaviour is not locked. Trackpads always pan. */
  wheel: "zoom" | "pan";
  /** Zoom speed, 0.5 .. 2. */
  sensitivity: number;
  /** Always apply `wheel` to every wheel event instead of telling trackpads and mouse wheels apart. */
  locked: boolean;
  /** Snap to edges, centres and equal spacing while dragging. */
  snap: boolean;
  /** Tablet mode: touch pans and only the pen draws. */
  penOnlyDraws: boolean;
};

export const DEFAULT_NAV_SETTINGS: NavSettings = {
  wheel: "zoom",
  sensitivity: 1,
  locked: false,
  snap: true,
  penOnlyDraws: false,
};

export const SETTINGS_KEY = "atelier-settings";

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/** Turn untrusted stored data into valid settings: wrong types fall back to the default, sensitivity is clamped. */
export function sanitizeSettings(raw: unknown): NavSettings {
  const d = DEFAULT_NAV_SETTINGS;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ...d };
  const r = raw as Record<string, unknown>;
  const sens = typeof r.sensitivity === "number" && Number.isFinite(r.sensitivity) ? r.sensitivity : d.sensitivity;
  return {
    wheel: r.wheel === "pan" || r.wheel === "zoom" ? r.wheel : d.wheel,
    sensitivity: Math.min(2, Math.max(0.5, sens)),
    locked: bool(r.locked, d.locked),
    snap: bool(r.snap, d.snap),
    penOnlyDraws: bool(r.penOnlyDraws, d.penOnlyDraws),
  };
}

export function loadSettings(): NavSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? sanitizeSettings(JSON.parse(raw)) : { ...DEFAULT_NAV_SETTINGS };
  } catch {
    return { ...DEFAULT_NAV_SETTINGS };
  }
}

export function saveSettings(s: NavSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(sanitizeSettings(s)));
  } catch {
    // not persisted; the in-memory value still applies for this session
  }
}
