"use client";

import type { LucideIcon } from "lucide-react";
import { Button, type ButtonVariant } from "./Button";
import { cx } from "./cx";

export type EmptyStateProps = {
  icon: LucideIcon;
  /** One short line. */
  message: string;
  actionLabel: string;
  onAction: () => void;
  actionIcon?: LucideIcon;
  actionVariant?: ButtonVariant;
  className?: string;
};

/** Empty screen: one line and one action that teaches the main gesture. */
export function EmptyState({
  icon: Icon,
  message,
  actionLabel,
  onAction,
  actionIcon,
  actionVariant = "primary",
  className,
}: EmptyStateProps) {
  return (
    <div className={cx("flex flex-col items-center gap-4 px-6 py-8 text-center", className)}>
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-raised text-fg-muted">
        <Icon size={24} strokeWidth={2} aria-hidden />
      </span>
      <p className="max-w-xs text-body text-fg-muted">{message}</p>
      <Button variant={actionVariant} icon={actionIcon} onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}
