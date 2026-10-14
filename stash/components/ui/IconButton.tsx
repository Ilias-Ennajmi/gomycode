"use client";

import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { cx } from "./cx";

export type IconButtonVariant = "plain" | "raised" | "accent";

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> & {
  /** Read by TalkBack; required because the button has no visible text. */
  label: string;
  icon: LucideIcon;
  variant?: IconButtonVariant;
  /** Toggle state (aria-pressed). Pressed uses the text colour, never the accent. */
  pressed?: boolean;
};

const VARIANT: Record<IconButtonVariant, string> = {
  plain: "text-fg hover:bg-raised",
  raised: "bg-raised text-fg",
  accent: "bg-accent text-on-accent",
};

export function IconButton({
  label,
  icon: Icon,
  variant = "plain",
  pressed,
  className,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      aria-pressed={pressed}
      className={cx(
        "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
        "transition-[background-color,transform] duration-[var(--dur-fast)] ease-standard active:scale-90",
        "disabled:cursor-not-allowed disabled:opacity-40",
        pressed ? "bg-fg text-background" : VARIANT[variant],
        className,
      )}
      {...rest}
    >
      <Icon size={24} strokeWidth={2} aria-hidden />
    </button>
  );
}
