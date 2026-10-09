"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { useMotionOK } from "@/lib/hooks/useMotionOK";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "on-accent";
export type ButtonSize = "md" | "lg";

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading lucide icon, drawn at 24px / stroke 2. */
  icon?: LucideIcon;
  fullWidth?: boolean;
  /** Busy: dims and pulses (no spinner), blocks clicks, sets aria-busy. */
  loading?: boolean;
  children: ReactNode;
};

const VARIANT: Record<ButtonVariant, string> = {
  // Accent = "act now" only.
  primary: "bg-accent text-on-accent",
  secondary: "border border-line text-fg hover:bg-raised",
  ghost: "text-fg hover:bg-raised",
  danger: "border border-line text-danger hover:bg-raised",
  // For buttons sitting on an accent surface (the Today hero).
  "on-accent": "bg-on-accent text-accent",
};

const SIZE: Record<ButtonSize, string> = {
  md: "h-12 px-5",
  lg: "h-14 px-6",
};

export function Button({
  variant = "primary",
  size = "md",
  icon: Icon,
  fullWidth,
  loading,
  disabled,
  className,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  const motionOK = useMotionOK();
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex shrink-0 select-none items-center justify-center gap-2 rounded-card font-body text-label",
        "transition-[opacity,background-color,transform] duration-[var(--dur-fast)] ease-standard active:scale-95",
        "disabled:cursor-not-allowed",
        disabled && !loading && "opacity-40",
        loading && "cursor-progress opacity-70",
        loading && motionOK && "animate-pulse",
        VARIANT[variant],
        SIZE[size],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {Icon && <Icon size={24} strokeWidth={2} aria-hidden />}
      <span className="truncate">{children}</span>
    </button>
  );
}
