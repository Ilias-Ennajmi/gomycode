// Colour maths for the accent picker: contrast ratios (WCAG 2.x), the
// automatic onAccent choice, and the "too close to a Space colour" warning.
// Works on #rrggbb strings; callers read token values from CSS at runtime, so
// no colour literals live here.

export type Rgb = { r: number; g: number; b: number };

export function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function toHex({ r, g, b }: Rgb): string {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance(c: Rgb): number {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

export function contrastRatio(a: string, b: string): number {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return 1;
  const la = luminance(ca);
  const lb = luminance(cb);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export const MIN_TEXT_CONTRAST = 4.5;

/**
 * Picks whichever ink gives the higher contrast on the accent. Returns the ink
 * and whether it reaches 4.5:1 (if neither does, the picker shows a warning).
 */
export function pickOnAccent(accent: string, darkInk: string, lightInk: string) {
  const dark = contrastRatio(accent, darkInk);
  const light = contrastRatio(accent, lightInk);
  const ink = dark >= light ? darkInk : lightInk;
  const ratio = Math.max(dark, light);
  return { ink, ratio, passes: ratio >= MIN_TEXT_CONTRAST };
}

// CIE76 distance in Lab space: good enough to flag "looks like the same colour".
function toLab(c: Rgb) {
  const lin = [channel(c.r), channel(c.g), channel(c.b)];
  const x = (lin[0] * 0.4124 + lin[1] * 0.3576 + lin[2] * 0.1805) / 0.95047;
  const y = lin[0] * 0.2126 + lin[1] * 0.7152 + lin[2] * 0.0722;
  const z = (lin[0] * 0.0193 + lin[1] * 0.1192 + lin[2] * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return { l: 116 * f(y) - 16, a: 500 * (f(x) - f(y)), b: 200 * (f(y) - f(z)) };
}

export function colorDistance(a: string, b: string): number {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return Infinity;
  const la = toLab(ca);
  const lb = toLab(cb);
  return Math.hypot(la.l - lb.l, la.a - lb.a, la.b - lb.b);
}

export const SPACE_CLASH_DISTANCE = 20;

/** Space names whose colour is too close to the accent to tell apart. */
export function clashingSpaces(accent: string, spaces: Record<string, string>): string[] {
  return Object.entries(spaces)
    .filter(([, hex]) => colorDistance(accent, hex) < SPACE_CLASH_DISTANCE)
    .map(([name]) => name);
}

/** Reads a CSS custom property as a #rrggbb string (browser only). */
export function readToken(name: string, el: Element = document.documentElement): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}
