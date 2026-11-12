"use client";

import { useId, useState, type KeyboardEvent } from "react";

export type NumberFieldProps = {
  id?: string;
  label: string;
  /** null = several different values (shown empty with a "Mixed" placeholder). */
  value: number | null;
  /** Called with the new value; `merge` is true for arrow-key steps, which should merge into one undo step. */
  onCommit(value: number, merge: boolean): void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  className?: string;
};

const round = (n: number) => Math.round(n * 100) / 100;
const format = (n: number) => String(round(n));

function parse(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (t === "" || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * A numeric text field for the Inspector. Typing is a draft: Enter or leaving the field commits it, Escape or text that
 * is not a number puts the old value back. ArrowUp / ArrowDown change the value by `step` (Shift: 10 x step) and commit
 * at once. A plain text input (not type=number) so the browser's spinner and wheel behaviour do not fight these rules.
 */
export function NumberField({ id, label, value, onCommit, min, max, step = 1, unit, disabled, className }: NumberFieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const [draft, setDraft] = useState<string | null>(null);

  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const shown = draft ?? (value === null ? "" : format(value));

  const commitDraft = () => {
    if (draft === null) return;
    const n = parse(draft);
    setDraft(null);
    if (n !== null) onCommit(clamp(n), false); // no change is a no-op for the document
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitDraft();
    } else if (e.key === "Escape" && draft !== null) {
      e.preventDefault();
      e.stopPropagation(); // cancel the edit, not the panel
      setDraft(null);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const base = (draft !== null ? parse(draft) : null) ?? value ?? 0;
      const delta = (e.shiftKey ? 10 : 1) * step * (e.key === "ArrowUp" ? 1 : -1);
      setDraft(null);
      onCommit(clamp(round(base + delta)), true);
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <label htmlFor={inputId} className="w-14 shrink-0 text-(length:--text-xs) text-fg-muted">
        {label}
      </label>
      <div className="relative min-w-0 flex-1">
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          value={shown}
          placeholder={value === null ? "Mixed" : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={commitDraft}
          onKeyDown={onKeyDown}
          className={`block min-h-(--target-min) w-full rounded-sm border border-line bg-panel px-2 text-(length:--text-sm) text-fg tabular-nums placeholder:text-fg-muted disabled:opacity-60 ${unit ? "pr-7" : ""}`}
        />
        {unit ? (
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-(length:--text-xs) text-fg-muted">
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}
