"use client";

import { useRef, type KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { LayoutGrid, Map as MapIcon, Orbit, type LucideIcon } from "lucide-react";
import { cx } from "@/components/ui/cx";
import { useMotionOK } from "@/lib/hooks/useMotionOK";
import { spring } from "@/lib/motionTokens";

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
  const motionOK = useMotionOK();
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = (i + d + LENSES.length) % LENSES.length;
    onChange(LENSES[next]);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label="Library view" className="flex gap-1 rounded-full bg-raised p-1">
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
              "press relative inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full px-3 text-label",
              selected ? "text-background" : "text-fg-muted hover:text-fg",
            )}
          >
            {selected && (
              <motion.span layoutId="lens-pill" aria-hidden className="absolute inset-0 rounded-full bg-fg" transition={spring("pop", motionOK)} />
            )}
            <Icon size={20} strokeWidth={2} aria-hidden className="relative" />
            <span className="relative">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
