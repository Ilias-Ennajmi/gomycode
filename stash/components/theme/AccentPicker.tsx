"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Plus } from "lucide-react";
import type { AccentPref } from "@/lib/theme/appearance";
import { clashingSpaces, pickOnAccent, readToken } from "@/lib/theme/contrast";
import { SPACE_COLORS, SPACE_LABEL, spaceVar } from "@/components/ui/space";
import { cx } from "@/components/ui/cx";
import { useAppearance } from "./ThemeProvider";

type Preset = { value: Exclude<AccentPref, "custom">; label: string; fill: string; ink: string };

// Swatches paint the real token colours.
const PRESETS: Preset[] = [
  { value: "lime", label: "Lime", fill: "var(--accent-lime)", ink: "var(--ink-dark)" },
  { value: "coral", label: "Coral", fill: "var(--accent-coral)", ink: "var(--ink-dark)" },
  { value: "sky", label: "Sky", fill: "var(--accent-sky)", ink: "var(--ink-dark)" },
  { value: "gold", label: "Gold", fill: "var(--accent-gold)", ink: "var(--ink-dark)" },
  { value: "mono", label: "Mono", fill: "var(--text-primary)", ink: "var(--background)" },
];

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const PRESET_VAR: Record<Preset["value"], string> = {
  lime: "--accent-lime",
  coral: "--accent-coral",
  sky: "--accent-sky",
  gold: "--accent-gold",
  mono: "--text-primary",
};

function spacePalette(el: Element): Record<string, string> {
  return Object.fromEntries(SPACE_COLORS.map((c) => [SPACE_LABEL[c].replace(" grey", ""), readToken(spaceVar(c), el)]));
}

/**
 * Warnings for the current accent: contrast of its ink (custom only; preset inks
 * are fixed) and closeness to a Space colour in either the light or dark palette,
 * read from hidden probe elements so both themes are checked whatever is showing.
 */
function accentWarnings(accent: string, isCustom: boolean, light: Element, dark: Element): string[] {
  const warnings: string[] = [];
  if (isCustom) {
    const r = pickOnAccent(accent, readToken("--ink-dark"), readToken("--ink-light"));
    if (!r.passes) warnings.push(`Text on this colour is hard to read (${r.ratio.toFixed(1)}:1, needs 4.5:1).`);
  }
  const inLight = clashingSpaces(accent, spacePalette(light));
  const inDark = clashingSpaces(accent, spacePalette(dark));
  const names = Array.from(new Set([...inLight, ...inDark]));
  if (names.length) {
    const where = inLight.length && inDark.length ? "" : inDark.length ? " in Dark" : " in Light";
    warnings.push(`Close to the ${listNames(names)} Space colour${names.length > 1 ? "s" : ""}${where}.`);
  }
  return warnings;
}

export function AccentPicker({ className, showWarnings = true }: { className?: string; showWarnings?: boolean }) {
  const { appearance, update } = useAppearance();
  const inputRef = useRef<HTMLInputElement>(null);
  const lightProbe = useRef<HTMLDivElement>(null);
  const darkProbe = useRef<HTMLDivElement>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const isCustom = appearance.accent === "custom" && !!appearance.accentCustom;
  const { accent, accentCustom, theme } = appearance;

  // Token values only exist in the DOM, so the check runs after render (and when the
  // accent, or the theme that Mono follows, changes).
  useEffect(() => {
    const light = lightProbe.current;
    const dark = darkProbe.current;
    if (!light || !dark) return;
    const custom = accent === "custom" && !!accentCustom;
    const value = custom ? accentCustom! : readToken(PRESET_VAR[accent === "custom" ? "lime" : accent]);
    setWarnings(value ? accentWarnings(value, custom, light, dark) : []);
  }, [accent, accentCustom, theme]);

  const pickPreset = (value: Preset["value"]) => update({ accent: value });

  const pickCustom = (hex: string) => {
    const { ink } = pickOnAccent(hex, readToken("--ink-dark"), readToken("--ink-light"));
    update({ accent: "custom", accentCustom: hex, onAccentCustom: ink });
  };

  const swatch = "relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full";
  const ring = (on: boolean) =>
    cx("flex h-10 w-10 items-center justify-center rounded-full", on && "ring-2 ring-fg ring-offset-2 ring-offset-background");

  return (
    <div className={className}>
      <div role="radiogroup" aria-label="Accent colour" className="flex flex-wrap gap-1">
        {PRESETS.map((p) => {
          const on = appearance.accent === p.value;
          return (
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={p.label}
              title={p.label}
              onClick={() => pickPreset(p.value)}
              className={swatch}
            >
              <span className={cx(ring(on), "border border-line")} style={{ background: p.fill, color: p.ink }}>
                {on && <Check size={20} strokeWidth={2} aria-hidden />}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={isCustom}
          aria-label="Custom colour"
          title="Custom colour"
          onClick={() => {
            const input = inputRef.current;
            if (!input) return;
            // Native picker starts from the current custom colour, else Lime.
            input.value = appearance.accentCustom ?? readToken("--accent-lime");
            input.click();
          }}
          className={swatch}
        >
          <span
            className={cx(ring(isCustom), isCustom ? "border border-line" : "border border-dashed border-fg-subtle text-fg")}
            style={isCustom ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}
          >
            {isCustom ? <Check size={20} strokeWidth={2} aria-hidden /> : <Plus size={20} strokeWidth={2} aria-hidden />}
          </span>
        </button>
        <input
          ref={inputRef}
          type="color"
          tabIndex={-1}
          aria-hidden
          className="sr-only"
          onChange={(e) => pickCustom(e.target.value.toLowerCase())}
        />
      </div>
      <div ref={lightProbe} data-theme="light" hidden />
      <div ref={darkProbe} data-theme="dark" hidden />
      {showWarnings && warnings.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1" aria-live="polite">
          {warnings.map((w) => (
            <li key={w} className="text-caption text-danger">
              {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
