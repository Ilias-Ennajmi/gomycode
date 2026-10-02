"use client";

import type { ButtonHTMLAttributes } from "react";
import { Sparkles } from "lucide-react";
import { useLongPress } from "@/lib/hooks/useLongPress";
import { cx } from "./cx";
import { SPACE_BG, SPACE_BORDER, SPACE_TEXT, SPACE_TINT, type SpaceColor } from "./space";

export type SpaceChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "color"> & {
  name: string;
  color: SpaceColor;
  count?: number;
  /** AI suggestion: spark icon and an outline in the Space colour. */
  suggested?: boolean;
  selected?: boolean;
  /** 500 ms hold (or right-click / context-menu key), e.g. to change the colour. */
  onLongPress?: () => void;
};

export function SpaceChip({
  name,
  color,
  count,
  suggested,
  selected,
  onLongPress,
  className,
  type = "button",
  ...rest
}: SpaceChipProps) {
  const press = useLongPress(onLongPress);
  return (
    <button
      type={type}
      aria-pressed={selected}
      aria-label={suggested ? `${name}, suggested Space` : undefined}
      className={cx("inline-flex h-12 shrink-0 touch-manipulation select-none items-center rounded-full", className)}
      {...press}
      {...rest}
    >
      <span
        className={cx(
          "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-label text-fg",
          SPACE_TINT[color],
          suggested ? SPACE_BORDER[color] : "border-transparent",
          selected && "ring-2 ring-fg",
        )}
      >
        {suggested ? (
          <Sparkles size={20} strokeWidth={2} aria-hidden className={SPACE_TEXT[color]} />
        ) : (
          <span aria-hidden className={cx("h-2 w-2 rounded-full", SPACE_BG[color])} />
        )}
        {name}
        {count !== undefined && <span className="text-caption text-fg-muted">{count}</span>}
      </span>
    </button>
  );
}
