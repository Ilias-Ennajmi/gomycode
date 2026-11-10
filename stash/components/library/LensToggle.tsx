"use client";

import { useRef, type KeyboardEvent } from "react";
import { LayoutGrid, Map as MapIcon, Orbit, type LucideIcon } from "lucide-react";
import { cx } from "@/components/ui/cx";

export const LENSES = ["grid", "map", "galaxy"] as const;
export type Lens = (typeof LENSES)[number];

export function isLens(v: string | null | undefined): v is Lens {
  return (LENSES as readonly string[]).includes(v ?? "");
}

const META: Record<Lens, { label: string; icon: LucideIcon }> = {
  grid: { label: "Grid", icon: LayoutGrid },
  map: { label: "Map", icon: MapIcon },
  galaxy: { label: "Galaxy", icon: Orbit },
};

/** Grid · Map · Galaxy. */
export function LensToggle({ value, onChange }: { value: Lens; onChange: (l: Lens) => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = (i + d + LENSES.length) % LENSES.length;
    onChange(LENSES[next]);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label="Library view" className="flex gap-1 rounded-card bg-raised p-1">
      {LENSES.map((l, i) => {
        const { label, icon: Icon } = META[l];
        const selected = value === l;
        return (
          <button
            key={l}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(l)}
            onKeyDown={(e) => onKey(e, i)}
            className={cx(
              "inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-sm px-3 text-label",
              "transition-colors duration-[var(--dur-fast)]",
              selected ? "bg-surface text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            <Icon size={20} strokeWidth={2} aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
