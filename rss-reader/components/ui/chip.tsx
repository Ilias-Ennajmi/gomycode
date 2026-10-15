import * as React from "react";
import { cn } from "@/lib/utils";

/** A small pill that filters a list. `active` fills it; works as a toggle or a radio. */
export function Chip({
  active,
  onClick,
  children,
  quiet,
  className,
}: {
  active: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  /** A lighter look for secondary choices (length, category). */
  quiet?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors active:scale-[0.97]",
        active
          ? quiet
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-foreground bg-foreground text-background"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
        className
      )}
    >
      {children}
    </button>
  );
}
