"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Illustration, type IllustrationName } from "@/components/brand/Illustration";
import { Button, type ButtonVariant } from "./Button";
import { cx } from "./cx";

export type EmptyStateProps = {
  /** A brand spot illustration (preferred). */
  illustration?: IllustrationName;
  /** Fallback when there is no illustration: a lucide icon in a circle. */
  icon?: LucideIcon;
  /** Short, friendly headline. */
  title?: string;
  /** One short line. */
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: LucideIcon;
  actionVariant?: ButtonVariant;
  /** A quieter second option under the action (a link). */
  secondary?: ReactNode;
  className?: string;
};

/** Empty screen: an illustration, one line and one action that teaches the main gesture. */
export function EmptyState({
  illustration,
  icon: Icon,
  title,
  message,
  actionLabel,
  onAction,
  actionIcon,
  actionVariant = "primary",
  secondary,
  className,
}: EmptyStateProps) {
  return (
    <div className={cx("rise-in flex flex-col items-center gap-3 px-6 py-8 text-center", className)}>
      {illustration ? (
        <Illustration name={illustration} className="mb-1 h-36" />
      ) : (
        Icon && (
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-raised text-fg-muted">
            <Icon size={24} strokeWidth={2} aria-hidden />
          </span>
        )
      )}
      {title && <h2 className="text-title">{title}</h2>}
      <p className="max-w-xs text-body text-fg-muted">{message}</p>
      {actionLabel && onAction && (
        <Button variant={actionVariant} icon={actionIcon} onClick={onAction} className="mt-2">
          {actionLabel}
        </Button>
      )}
      {secondary}
    </div>
  );
}
