"use client";

import { useId, type InputHTMLAttributes } from "react";
import { cx } from "./cx";

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label: string;
  hint?: string;
  error?: string;
  /** Visually hide the label (kept for screen readers). */
  hideLabel?: boolean;
};

export function TextField({ label, hint, error, hideLabel, id, className, ...rest }: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const noteId = `${inputId}-note`;
  const note = error ?? hint;
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <label htmlFor={inputId} className={cx("text-label text-fg", hideLabel && "sr-only")}>
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        className={cx(
          "h-12 w-full rounded-card border bg-raised px-4 text-input text-fg placeholder:text-fg-subtle",
          "outline-none focus:ring-2 focus:ring-fg",
          error ? "border-danger" : "border-transparent",
        )}
        {...rest}
      />
      {note && (
        <span id={noteId} className={cx("text-caption", error ? "text-danger" : "text-fg-muted")}>
          {note}
        </span>
      )}
    </div>
  );
}
