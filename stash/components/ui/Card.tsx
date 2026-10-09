import type { HTMLAttributes } from "react";
import { cx } from "./cx";
import { SPACE_BG, type SpaceColor } from "./space";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Draws a 3px top edge in the Space colour (the thumbnail top edge pattern). */
  spaceColor?: SpaceColor;
  /** "md" = 14px radius (default), "lg" = 20px for large cards. */
  size?: "md" | "lg";
  padded?: boolean;
};

export function Card({ spaceColor, size = "md", padded = true, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cx(
        "relative overflow-hidden border border-line bg-surface text-fg",
        size === "lg" ? "rounded-lg" : "rounded-card",
        padded && "p-4",
        className,
      )}
      {...rest}
    >
      {/* 3px Space top edge (spec: "thumbnail top edge"); a hairline, not a spacing step. */}
      {spaceColor && <span aria-hidden className={cx("absolute inset-x-0 top-0 h-0.75", SPACE_BG[spaceColor])} />}
      {children}
    </div>
  );
}
