"use client";

import { useRef, useState } from "react";
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

/** Checks a custom accent: contrast of its ink, and closeness to the Space palette in the current theme. */
function checkCustom(hex: string) {
  const result = pickOnAccent(hex, readToken("--ink-dark"), readToken("--ink-light"));
  const spaces = Object.fromEntries(SPACE_COLORS.map((c) => [SPACE_LABEL[c].replace(" grey", ""), readToken(spaceVar(c))]));
  const clashes = clashingSpaces(hex, spaces);
  const warnings: string[] = [];
  if (!result.passes) warnings.push(`Text on this colour is hard to read (${result.ratio.toFixed(1)}:1, needs 4.5:1).`);
  if (clashes.length) warnings.push(`Close to your ${listNames(clashes)} Space colour${clashes.length > 1 ? "s" : ""}.`);
  return { ink: result.ink, warnings };
}

export function AccentPicker({ className, showWarnings = true }: { className?: string; showWarnings?: boolean }) {
  const { appearance, update } = useAppearance();
  const inputRef = useRef<HTMLInputElement>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const isCustom = appearance.accent === "custom" && !!appearance.accentCustom;

  const pickPreset = (value: Preset["value"]) => {
    setWarnings([]);
    update({ accent: value });
  };

  const pickCustom = (hex: string) => {
    const { ink, warnings: w } = checkCustom(hex);
    setWarnings(w);
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
      {showWarnings && isCustom && warnings.length > 0 && (
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
