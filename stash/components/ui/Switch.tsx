"use client";

import { useId } from "react";
import { cx } from "./cx";

export type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Visible label (also the accessible name). */
  label: string;
  description?: string;
  /** Hide the visible label (still read by screen readers). */
  hideLabel?: boolean;
  disabled?: boolean;
  className?: string;
};

/** Toggle row with a 48px tap area. On uses the text colour, never the accent. */
export function Switch({ checked, onChange, label, description, hideLabel, disabled, className }: SwitchProps) {
  const descId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={hideLabel ? label : undefined}
      aria-describedby={description ? descId : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "flex min-h-12 items-center gap-4 text-left disabled:cursor-not-allowed disabled:opacity-40",
        hideLabel ? "w-12 justify-center" : "w-full justify-between",
        className,
      )}
    >
      {!hideLabel && (
        <span className="flex min-w-0 flex-col">
          <span className="text-body text-fg">{label}</span>
          {description && (
            <span id={descId} className="text-caption text-fg-muted">
              {description}
            </span>
          )}
        </span>
      )}
      <span
        aria-hidden
        className={cx(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border",
          "transition-colors duration-[var(--dur-fast)] ease-standard",
          checked ? "border-fg bg-fg" : "border-line bg-raised",
        )}
      >
        <span
          className={cx(
            "absolute left-0.5 h-5.5 w-5.5 rounded-full transition-transform duration-[var(--dur-fast)] ease-standard",
            checked ? "translate-x-5 bg-background" : "translate-x-0 bg-fg-subtle",
          )}
        />
      </span>
    </button>
  );
}
