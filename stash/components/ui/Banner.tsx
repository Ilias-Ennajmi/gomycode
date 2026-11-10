import type { ReactNode } from "react";
import { Info, WifiOff } from "lucide-react";
import { cx } from "./cx";

export type BannerProps = {
  variant?: "offline" | "info";
  children: ReactNode;
  action?: ReactNode;
  className?: string;
};

/** Small inline banner. Offline: saving and cached playback still work, so it informs, never blocks. */
export function Banner({ variant = "info", children, action, className }: BannerProps) {
  const Icon = variant === "offline" ? WifiOff : Info;
  return (
    <div
      role="status"
      className={cx(
        "flex min-h-14 items-center gap-3 rounded-lg border border-line bg-surface px-4 py-2 text-label text-fg shadow-pop",
        className,
      )}
    >
      <Icon size={24} strokeWidth={2} aria-hidden className="shrink-0 text-fg-muted" />
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  );
}
