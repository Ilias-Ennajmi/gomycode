"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { useMotionOK } from "@/lib/hooks/useMotionOK";
import { cx } from "./cx";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  icon?: LucideIcon;
};

export type SegmentedProps<T extends string> = {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group. */
  label: string;
  /** Show only icons (labels become aria-labels). */
  iconOnly?: boolean;
  fullWidth?: boolean;
  className?: string;
};

/** Segmented control as a radiogroup with arrow-key navigation. Selected = surface pill, text colour. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  iconOnly,
  fullWidth,
  className,
}: SegmentedProps<T>) {
  const motionOK = useMotionOK();
  const pillId = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (i + delta + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx("inline-flex max-w-full gap-1 rounded-card bg-raised p-1", fullWidth && "flex w-full", className)}
    >
      {options.map((o, i) => {
        const selected = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={iconOnly ? o.label : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cx(
              "relative inline-flex h-12 min-w-12 flex-1 items-center justify-center gap-2 rounded-sm px-3 text-label",
              "transition-colors duration-[var(--dur-fast)]",
              selected ? "text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            {selected &&
              (motionOK ? (
                <motion.span
                  layoutId={pillId}
                  aria-hidden
                  className="absolute inset-0 rounded-sm bg-surface"
                  transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
                />
              ) : (
                <span aria-hidden className="absolute inset-0 rounded-sm bg-surface" />
              ))}
            <span className="relative inline-flex items-center gap-2 whitespace-nowrap">
              {Icon && <Icon size={24} strokeWidth={2} aria-hidden />}
              {!iconOnly && o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
