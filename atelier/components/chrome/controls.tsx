"use client";

import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Plus, type LucideIcon } from "lucide-react";
import { Tip } from "./Tip";
import { COLOR_MIXED, SWATCHES, cssColorToHex, swatchLabel } from "./swatches";

/** Shared look of the editor's chrome buttons: 36 px (44 on touch), press scale 0.97, hover only with a fine pointer. */
const chromeBase =
  "inline-flex shrink-0 select-none items-center justify-center rounded-md text-fg transition-[transform,background-color,color,opacity] duration-(--dur-fast) ease-out active:scale-[0.97] hoverable:bg-(--color-selection-fill) aria-pressed:bg-(--color-selection-fill) aria-pressed:text-select aria-expanded:bg-(--color-selection-fill) aria-disabled:opacity-40 aria-disabled:pointer-events-none disabled:opacity-40 disabled:pointer-events-none";
export const chromeButton = `${chromeBase} size-9 pointer-coarse:size-11`;
/** A button with a text label (or a label next to its icon). */
export const chromeTextButton = `${chromeBase} h-9 min-w-9 gap-2 px-2.5 pointer-coarse:h-11 pointer-coarse:min-w-11`;

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> & {
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  /** Tooltip text when it differs from the label. */
  tip?: string;
  tipSide?: "top" | "bottom";
  /** Classes of the element around the button (tooltip anchor); default `inline-flex`. */
  wrap?: string;
  pressed?: boolean;
  size?: number;
  children?: ReactNode;
};

/** An icon-only button with its accessible name, tooltip and shortcut hint. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon: Icon, shortcut, tip, tipSide = "top", wrap, pressed, size = 18, className = "", children, type = "button", ...rest },
  ref,
) {
  return (
    <Tip label={tip ?? label} shortcut={shortcut} side={tipSide} className={wrap}>
      <button
        ref={ref}
        type={type}
        aria-label={label}
        aria-pressed={pressed}
        aria-keyshortcuts={shortcut ? shortcut.replace(/^Mod\+/, "Control+") : undefined}
        className={`${chromeButton} ${className}`}
        {...rest}
      >
        <Icon aria-hidden="true" size={size} strokeWidth={1.75} />
        {children}
      </button>
    </Tip>
  );
});

/** A one-of-many choice: radios in a group, each with a label (visible or icon + aria-label). */
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  className = "",
}: {
  label: string;
  value: T | null;
  options: { value: T; label: string; icon?: LucideIcon; text?: string }[];
  onChange(v: T): void;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={`flex items-center gap-0.5 rounded-md bg-canvas p-0.5 ${className}`}>
      {options.map((o) => {
        const on = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.label}
            tabIndex={on || (value === null && o === options[0]) ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              const i = options.findIndex((x) => x.value === o.value);
              const to = e.key === "ArrowRight" || e.key === "ArrowDown" ? (i + 1) % options.length : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (i - 1 + options.length) % options.length : -1;
              if (to < 0) return;
              e.preventDefault();
              onChange(options[to].value);
              const group = e.currentTarget.parentElement;
              requestAnimationFrame(() => group?.querySelectorAll<HTMLElement>('[role="radio"]')[to]?.focus());
            }}
            className="inline-flex min-h-7 min-w-7 items-center justify-center gap-1.5 rounded-sm px-2 text-(length:--text-xs) font-medium text-fg transition-[transform,background-color] duration-(--dur-fast) ease-out active:scale-[0.97] pointer-coarse:min-h-11 pointer-coarse:min-w-11 hoverable:bg-line aria-checked:bg-panel aria-checked:text-select aria-checked:shadow-1"
          >
            {Icon ? <Icon aria-hidden="true" size={16} strokeWidth={1.75} /> : null}
            {o.text ? <span>{o.text}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Token swatches plus an optional "none" and a native colour picker for any other colour. */
export function SwatchGrid({
  label,
  value,
  onChange,
  allowNone = false,
}: {
  label: string;
  /** Current colour (a token reference or CSS colour); null = none; undefined = mixed. */
  value: string | null | undefined;
  onChange(v: string | null): void;
  allowNone?: boolean;
}) {
  const id = useId();
  const custom = typeof value === "string" && !SWATCHES.some((s) => s.value === value);
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-7 gap-1.5">
      {allowNone ? (
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          aria-label="None"
          onClick={() => onChange(null)}
          className="relative inline-flex size-7 items-center justify-center rounded-sm border border-line bg-panel transition-transform duration-(--dur-fast) ease-out active:scale-[0.97] pointer-coarse:size-11 aria-checked:outline-2 aria-checked:outline-offset-1 aria-checked:outline-select"
        >
          <span aria-hidden="true" className="absolute h-px w-5 rotate-45 bg-alert" />
        </button>
      ) : null}
      {SWATCHES.map((s) => (
        <button
          key={s.value}
          type="button"
          role="radio"
          aria-checked={value === s.value}
          aria-label={s.label}
          title={s.label}
          onClick={() => onChange(s.value)}
          style={{ background: s.value }}
          className="inline-flex size-7 rounded-sm border border-line transition-transform duration-(--dur-fast) ease-out active:scale-[0.97] pointer-coarse:size-11 aria-checked:outline-2 aria-checked:outline-offset-1 aria-checked:outline-select"
        />
      ))}
      <label
        htmlFor={id}
        title="Custom colour"
        style={custom ? { background: value as string } : undefined}
        className={`relative inline-flex size-7 cursor-pointer items-center justify-center overflow-hidden rounded-sm border border-line text-(length:--text-xs) font-medium pointer-coarse:size-11 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-select ${custom ? "outline-2 outline-offset-1 outline-select" : "bg-panel"}`}
      >
        {custom ? null : <Plus aria-hidden="true" size={14} strokeWidth={2} />}
        <input
          id={id}
          type="color"
          aria-label={`${label}: custom colour`}
          value={typeof value === "string" ? cssColorToHex(value) : COLOR_MIXED}
          onChange={(e) => onChange(e.target.value)}
          className="absolute -inset-px h-[calc(100%+2px)] w-[calc(100%+2px)] cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}

/** The colour chip that opens a swatch popover (shows the current colour). */
export function ColorChip({ value }: { value: string | null | undefined }) {
  return (
    <span
      aria-hidden="true"
      style={value ? { background: value } : undefined}
      className="relative inline-block size-5 overflow-hidden rounded-sm border border-line bg-panel"
    >
      {value === null ? <span className="absolute top-1/2 left-0 h-px w-full -rotate-45 bg-alert" /> : null}
      {value === undefined ? <span className="absolute inset-0 bg-[conic-gradient(var(--color-muted),var(--color-border),var(--color-muted))]" /> : null}
    </span>
  );
}

export { swatchLabel };
