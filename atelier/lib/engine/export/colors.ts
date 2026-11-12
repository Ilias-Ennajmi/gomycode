// Concrete colours for export. Objects store tokens ("var(--color-ink)") and CSS colours; a file has no stylesheet, so
// every colour is resolved to lower-case #rrggbb. Exports are always drawn on the light theme (what you would print or
// send), whatever theme the editor is in. The token table mirrors styles/tokens.css (tests/unit/export-colors.test.ts
// fails when the two drift apart).
import { hexToRgb, normalizeHex, rgbToHex } from "@/lib/engine/model/color";

export const LIGHT_TOKENS: Readonly<Record<string, string>> = {
  "--color-bg": "#f5f2ec",
  "--color-surface": "#ffffff",
  "--color-ink": "#141414",
  "--color-muted": "#5e5b55",
  "--color-border": "#e0dcd3",
  "--color-accent": "#2f4a6d",
  "--color-on-accent": "#ffffff",
  "--color-danger": "#b3261e",
  "--color-selection": "#2f4a6d",
  "--sticky-yellow": "#f6e58d",
  "--sticky-peach": "#f8c9a8",
  "--sticky-pink": "#f4b8c5",
  "--sticky-lilac": "#d2c3ee",
  "--sticky-blue": "#bcd5f0",
  "--sticky-mint": "#bfe6cf",
  "--sticky-sand": "#e6d9bf",
  "--sticky-grey": "#d9d6cf",
};

const NAMED: Record<string, string | null> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  orange: "#ffa500",
  purple: "#800080",
  pink: "#ffc0cb",
  gray: "#808080",
  grey: "#808080",
  transparent: null,
  none: null,
  currentcolor: "#141414",
};

const clampByte = (n: number) => Math.min(255, Math.max(0, Math.round(n)));

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
}

/** A stored colour as #rrggbb, or null for "no colour" (transparent, none). Unreadable values give `fallback`. */
export function resolveColor(value: string | null | undefined, fallback: string | null = LIGHT_TOKENS["--color-ink"]): string | null {
  if (typeof value !== "string") return fallback;
  const v = value.trim();
  if (v === "") return fallback;
  const token = /^var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]*)?\)$/i.exec(v);
  if (token) return LIGHT_TOKENS[token[1].toLowerCase()] ?? fallback;
  if (v[0] === "#") {
    const hex = normalizeHex(v.length === 9 ? v.slice(0, 7) : v.length === 5 ? v.slice(0, 4) : v);
    return hex ?? fallback;
  }
  const fn = /^(rgba?|hsla?)\(\s*([^)]*)\)$/i.exec(v);
  if (fn) {
    const nums = fn[2].split(/[\s,/]+/).filter(Boolean).map((p) => (p.endsWith("%") ? Number.parseFloat(p) / 100 : Number.parseFloat(p)));
    if (nums.length < 3 || nums.slice(0, 3).some((n) => !Number.isFinite(n))) return fallback;
    if (fn[1].toLowerCase().startsWith("rgb")) {
      const pct = /%/.test(fn[2].split(/[\s,/]+/)[0]);
      return rgbToHex(...(nums.slice(0, 3).map((n) => clampByte(pct ? n * 255 : n)) as [number, number, number]));
    }
    const [h, s, l] = nums;
    return hslToHex(((h % 360) + 360) % 360, Math.min(1, Math.max(0, s)), Math.min(1, Math.max(0, l)));
  }
  const key = v.toLowerCase();
  if (key in NAMED) return NAMED[key] ?? null;
  return fallback;
}

/** Black or white ink, whichever reads better on `hex` (WCAG relative luminance). */
export function contrastInk(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return LIGHT_TOKENS["--color-ink"];
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  return L > 0.4 ? LIGHT_TOKENS["--color-ink"] : LIGHT_TOKENS["--color-surface"];
}
