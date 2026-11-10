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
      className={cx("press inline-flex h-12 shrink-0 touch-manipulation select-none items-center rounded-full", className)}
      {...press}
      {...rest}
    >
      <span
        className={cx(
          "inline-flex h-10 items-center gap-2 rounded-full border-2 px-4 text-label",
          // Selected: a confident solid block in the Space colour.
          selected ? cx(SPACE_BG[color], "text-on-space border-transparent") : cx(SPACE_TINT[color], "text-fg"),
          !selected && (suggested ? SPACE_BORDER[color] : "border-transparent"),
        )}
      >
        {suggested ? (
          <Sparkles size={20} strokeWidth={2} aria-hidden className={selected ? undefined : SPACE_TEXT[color]} />
        ) : (
          <span aria-hidden className={cx("h-2.5 w-2.5 rounded-full", selected ? "bg-on-space" : SPACE_BG[color])} />
        )}
        {name}
        {count !== undefined && <span className={cx("text-caption", !selected && "text-fg-muted")}>{count}</span>}
      </span>
    </button>
  );
}
