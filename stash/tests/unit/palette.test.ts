import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio, parseHex, toHex } from "@/lib/theme/contrast";
import { BRAND } from "@/lib/theme/brand";
import { SPACE_COLORS } from "@/components/ui/space";

/*
 * Contrast across every theme × accent, read straight from styles/tokens.css, so a retuned
 * token that breaks 4.5:1 (text) or 3:1 (icons, dots, lines) fails here.
 */

const css = readFileSync(new URL("../../styles/tokens.css", import.meta.url), "utf8");

function block(selector: string): string {
  const i = css.indexOf(selector);
  if (i < 0) throw new Error(`no ${selector} block`);
  return css.slice(i, css.indexOf("}", i));
}

function vars(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const statics = vars(block("/* ---------- Static values"));
const THEMES = {
  light: vars(block('[data-theme="light"] {')),
  dark: vars(block('[data-theme="dark"] {')),
  black: vars(block('[data-theme="black"] {')),
} as const;
type Theme = keyof typeof THEMES;

/** color-mix(in srgb, a p%, b) */
function mix(a: string, b: string, p: number): string {
  const x = parseHex(a)!;
  const y = parseHex(b)!;
  const k = p / 100;
  return toHex({ r: x.r * k + y.r * (1 - k), g: x.g * k + y.g * (1 - k), b: x.b * k + y.b * (1 - k) });
}

/** The accent and its ink as each preset resolves them (mono = the theme's text colour). */
function accents(theme: Theme) {
  const t = THEMES[theme];
  return {
    lime: { accent: statics["--accent-lime"], ink: statics["--ink-dark"] },
    coral: { accent: statics["--accent-coral"], ink: statics["--ink-dark"] },
    sky: { accent: statics["--accent-sky"], ink: statics["--ink-dark"] },
    gold: { accent: statics["--accent-gold"], ink: statics["--ink-dark"] },
    mono: { accent: t["--text-primary"], ink: t["--background"] },
  };
}

const ratio = (a: string, b: string) => Number(contrastRatio(a, b).toFixed(2));

describe.each(Object.keys(THEMES) as Theme[])("%s theme", (theme) => {
  const t = THEMES[theme];
  const grounds = { background: t["--background"], surface: t["--surface"], raised: t["--surface-raised"] };

  it("text, AI and danger colours reach 4.5:1 on every surface", () => {
    for (const [ground, bg] of Object.entries(grounds)) {
      for (const fg of ["--text-primary", "--text-secondary", "--text-tertiary", "--insight", "--danger"]) {
        expect(ratio(t[fg], bg), `${fg} on ${ground}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it.each(["lime", "coral", "sky", "gold", "mono"] as const)("accent %s: its ink reads 4.5:1 and the accent line 3:1", (name) => {
    const { accent, ink } = accents(theme)[name];
    expect(ratio(ink, accent), "onAccent on accent").toBeGreaterThanOrEqual(4.5);
    // --accent-line: the accent where it reads on the page, the ink in the light theme.
    const line = theme === "light" ? t["--text-primary"] : accent;
    expect(ratio(line, t["--background"]), "accent line on background").toBeGreaterThanOrEqual(3);
  });

  it.each(SPACE_COLORS)("Space %s: dots 3:1, solid blocks and tinted cards 4.5:1", (c) => {
    const color = t[`--space-${c}`];
    const tint = mix(color, t["--surface"], parseFloat(t["--tint-amount"]));
    expect(ratio(color, t["--surface"]), "dot / icon on surface").toBeGreaterThanOrEqual(3);
    expect(ratio(color, t["--background"]), "dot / icon on background").toBeGreaterThanOrEqual(3);
    expect(ratio(t["--on-space"], color), "ink on a solid Space block").toBeGreaterThanOrEqual(4.5);
    expect(ratio(t["--text-primary"], tint), "text on a tint").toBeGreaterThanOrEqual(4.5);
    expect(ratio(t["--text-secondary"], tint), "muted text on a tint").toBeGreaterThanOrEqual(4.5);
  });

  it("the AI colour stays readable on Space tints (AI labels on For you and synthesis cards)", () => {
    for (const c of SPACE_COLORS) {
      const tint = mix(t[`--space-${c}`], t["--surface"], parseFloat(t["--tint-amount"]));
      expect(ratio(t["--insight"], tint), `insight on ${c} tint`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("brand", () => {
  it("the mark is lime on deep ink, well above 4.5:1", () => {
    expect(statics["--brand-lime"]).toBe(BRAND.lime);
    expect(statics["--brand-ink"]).toBe(BRAND.ink);
    expect(ratio(BRAND.lime, BRAND.ink)).toBeGreaterThanOrEqual(12);
  });

  it("the default accent is the brand lime", () => {
    expect(statics["--accent-lime"]).toBe(statics["--brand-lime"]);
  });
});
