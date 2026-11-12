/** The colours the editor offers for fills, strokes, text and pens: token references, so both themes stay in step. */
export type Swatch = { value: string; label: string };

export const SWATCHES: readonly Swatch[] = [
  { value: "var(--color-ink)", label: "Ink" },
  { value: "var(--color-muted)", label: "Stone" },
  { value: "var(--color-accent)", label: "Ink blue" },
  { value: "var(--color-danger)", label: "Red" },
  { value: "var(--sticky-yellow)", label: "Yellow" },
  { value: "var(--sticky-peach)", label: "Peach" },
  { value: "var(--sticky-pink)", label: "Pink" },
  { value: "var(--sticky-lilac)", label: "Lilac" },
  { value: "var(--sticky-blue)", label: "Blue" },
  { value: "var(--sticky-mint)", label: "Mint" },
  { value: "var(--sticky-sand)", label: "Sand" },
  { value: "var(--sticky-grey)", label: "Grey" },
];

export const swatchLabel = (value: string | null): string => (value === null ? "None" : (SWATCHES.find((s) => s.value === value)?.label ?? "Custom"));

const toHexByte = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
const hexOf = (r: number, g: number, b: number) => `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;

/** What the native colour input shows when the current colour cannot be resolved (black), and for a mixed selection (mid grey). */
export const COLOR_FALLBACK = hexOf(0, 0, 0);
export const COLOR_MIXED = hexOf(128, 128, 128);

/**
 * `#rrggbb` for any CSS colour the browser can resolve (a token reference, a name, rgb()); the native colour input
 * needs that form. Falls back to the given `fallback` when it cannot be resolved (no layout, jsdom).
 */
export function cssColorToHex(css: string, fallback: string = COLOR_FALLBACK): string {
  if (/^#[0-9a-f]{6}$/i.test(css)) return css.toLowerCase();
  if (typeof document === "undefined") return fallback;
  try {
    const probe = document.createElement("span");
    probe.style.color = css;
    if (!probe.style.color) return fallback; // not a colour the browser understands
    document.body.append(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(resolved);
    return m ? hexOf(+m[1], +m[2], +m[3]) : fallback;
  } catch {
    return fallback;
  }
}
