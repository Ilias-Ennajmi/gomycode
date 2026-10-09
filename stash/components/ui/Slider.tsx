"use client";

import { useId } from "react";
import { cx } from "./cx";

export type SliderProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Value text shown and read out; default "<value>%". */
  format?: (value: number) => string;
  className?: string;
};

// Thumb is 24px; the filled track ends at the thumb's centre.
const THUMB = 24;

const THUMB_CLASSES = [
  "[&::-webkit-slider-runnable-track]:bg-transparent",
  "[&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none",
  "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-surface [&::-webkit-slider-thumb]:bg-fg",
  "[&::-moz-range-track]:bg-transparent",
  "[&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:rounded-full",
  "[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-surface [&::-moz-range-thumb]:bg-fg",
].join(" ");

export function Slider({ label, value, onChange, min = 90, max = 130, step = 5, format, className }: SliderProps) {
  const id = useId();
  const text = format ? format(value) : `${value}%`;
  const pct = (value - min) / (max - min);
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="text-body text-fg">
          {label}
        </label>
        <output htmlFor={id} className="text-label text-fg-muted">
          {text}
        </output>
      </div>
      <div className="relative flex h-12 items-center">
        <span aria-hidden className="absolute inset-x-0 h-2 rounded-full bg-raised" />
        <span
          aria-hidden
          className="absolute left-0 h-2 rounded-full bg-fg"
          style={{ width: `calc(${pct} * (100% - ${THUMB}px) + ${THUMB / 2}px)` }}
        />
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-valuetext={text}
          onChange={(e) => onChange(Number(e.target.value))}
          className={cx("relative h-12 w-full cursor-pointer appearance-none bg-transparent", THUMB_CLASSES)}
        />
      </div>
    </div>
  );
}
