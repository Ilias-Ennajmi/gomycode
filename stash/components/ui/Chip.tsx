"use client";

import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";
import { SPACE_BG, type SpaceColor } from "./space";

export type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label: string;
  selected?: boolean;
  count?: number;
  /** Leading colour dot (a Space colour). */
  dot?: SpaceColor;
};

/** Selectable filter chip. 48px tap area around a 36px pill. Selected = text colour, never accent. */
export function Chip({ label, selected = false, count, dot, className, type = "button", ...rest }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cx("group inline-flex h-12 shrink-0 items-center rounded-full", className)}
      {...rest}
    >
      <span
        className={cx(
          "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-label",
          "transition-colors duration-[var(--dur-fast)] ease-standard",
          selected ? "border-fg bg-fg text-background" : "border-line text-fg group-hover:bg-raised",
        )}
      >
        {dot && <span aria-hidden className={cx("h-2 w-2 rounded-full", SPACE_BG[dot])} />}
        {label}
        {count !== undefined && (
          <span className={cx("text-caption", selected ? "opacity-80" : "text-fg-muted")}>{count}</span>
        )}
      </span>
    </button>
  );
}
