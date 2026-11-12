// Colour maths for swatches, palettes and palette export. Pure, no DOM. All hex strings are sRGB.
import type { ColorFormat } from "./types";

export type Oklab = [number, number, number];

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#rgb` or `#rrggbb` (any case) to bytes; null for anything else. */
export function hexToRgb(hex: string): [number, number, number] | null {
  if (typeof hex !== "string" || !HEX.test(hex)) return null;
  const h = hex.slice(1);
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function byte(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(255, Math.max(0, Math.round(v)));
}

/** Clamps each channel to 0..255, rounds, and returns lower-case `#rrggbb`. NaN reads as 0. */
export function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => byte(v).toString(16).padStart(2, "0")).join("");
}

/** `#rgb`/`#rrggbb` in any case to lower-case `#rrggbb`; null when it is not a colour. */
export function normalizeHex(hex: string): string | null {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToHex(...rgb) : null;
}

const toLinear = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const fromLinear = (v: number): number => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return c * 255;
};

/** sRGB bytes to OKLab (Ottosson). */
export function rgbToOklab(r: number, g: number, b: number): Oklab {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Hex to OKLab. An unparseable colour reads as black: callers validate first, this never throws. */
export function hexToOklab(hex: string): Oklab {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToOklab(...rgb) : [0, 0, 0];
}

/** OKLab to lower-case hex, clamped to the sRGB gamut. NaN reads as black. */
export function oklabToHex(L: number, a: number, b: number): string {
  if (![L, a, b].every(Number.isFinite)) return "#000000";
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const clampLin = (v: number) => Math.min(1, Math.max(0, v));
  return rgbToHex(fromLinear(clampLin(lr)), fromLinear(clampLin(lg)), fromLinear(clampLin(lb)));
}

/** Euclidean distance in OKLab: 0 for identical colours, about 1 for black vs white. */
export function deltaE(a: Oklab, b: Oklab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** CSS value of a colour: `#2f4a6d`, `rgb(47 74 109)` or `oklch(0.40 0.06 255)`. An invalid colour is returned unchanged. */
export function formatColor(hex: string, fmt: ColorFormat): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  if (fmt === "hex") return rgbToHex(...rgb);
  if (fmt === "rgb") return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`;
  const [L, a, b] = rgbToOklab(...rgb);
  const C = Math.hypot(a, b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  const hue = C < 0.004 ? 0 : Math.round(h) % 360;
  return `oklch(${Math.min(1, Math.max(0, L)).toFixed(2)} ${C < 0.004 ? "0.00" : C.toFixed(2)} ${hue})`;
}
