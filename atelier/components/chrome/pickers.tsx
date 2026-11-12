"use client";

import { Circle, Diamond, RectangleHorizontal, Square, Star, Triangle, type LucideIcon } from "lucide-react";
import { STICKY_COLORS, FRAME_PRESETS, framePresetPx } from "@/lib/engine/model/defaults";
import type { FramePresetId, Head, ShapeKind, StickyColor, StickySize, StrokeStyle } from "@/lib/engine/model/types";
import { Choice } from "./controls";

/** Pickers shared by the toolbar's tool options and the context bar's selection options. */

export const SHAPE_KINDS: { value: ShapeKind; label: string; icon: LucideIcon }[] = [
  { value: "rect", label: "Rectangle", icon: Square },
  { value: "roundRect", label: "Rounded rectangle", icon: RectangleHorizontal },
  { value: "ellipse", label: "Ellipse", icon: Circle },
  { value: "triangle", label: "Triangle", icon: Triangle },
  { value: "diamond", label: "Diamond", icon: Diamond },
  { value: "star", label: "Star", icon: Star },
];

export function ShapeKindChoice({ value, onChange }: { value: ShapeKind | null; onChange(v: ShapeKind): void }) {
  return <Choice label="Shape" value={value} options={SHAPE_KINDS} onChange={onChange} />;
}

const STICKY_LABELS: Record<StickyColor, string> = { yellow: "Yellow", peach: "Peach", pink: "Pink", lilac: "Lilac", blue: "Blue", mint: "Mint", sand: "Sand", grey: "Grey" };

export function StickyColorPicker({ value, onChange }: { value: StickyColor | null; onChange(v: StickyColor): void }) {
  return (
    <div role="radiogroup" aria-label="Colour" className="grid grid-cols-4 gap-1.5">
      {(Object.keys(STICKY_COLORS) as StickyColor[]).map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={STICKY_LABELS[c]}
          title={STICKY_LABELS[c]}
          onClick={() => onChange(c)}
          style={{ background: `var(${STICKY_COLORS[c]})` }}
          className="inline-flex size-8 rounded-sm border border-line transition-transform duration-(--dur-fast) ease-out active:scale-[0.97] pointer-coarse:size-11 aria-checked:outline-2 aria-checked:outline-offset-1 aria-checked:outline-select"
        />
      ))}
    </div>
  );
}

const SIZE_OPTIONS: { value: StickySize; label: string; text: string }[] = [
  { value: "S", label: "Small", text: "S" },
  { value: "M", label: "Medium", text: "M" },
  { value: "L", label: "Large", text: "L" },
  { value: "XL", label: "Extra large", text: "XL" },
];

export function StickySizeChoice({ value, onChange, label = "Size" }: { value: StickySize | null; onChange(v: StickySize): void; label?: string }) {
  return <Choice label={label} value={value} options={SIZE_OPTIONS} onChange={onChange} />;
}

const PRESET_ORDER: FramePresetId[] = ["slide-16-9", "slide-4-3", "ig-post-4-5", "square", "story-9-16", "a4", "a3", "letter", "custom"];

/** "1920 × 1080 px", "210 × 297 mm", "8.5 × 11 in". */
export function presetSize(id: FramePresetId): string {
  const p = FRAME_PRESETS[id];
  return `${p.w} × ${p.h} ${p.unit}`;
}

/** Every frame preset with its real size. Physical sizes also show their canvas size at 96 dpi. */
export function FramePresetList({ value, onChange }: { value: FramePresetId | null; onChange(v: FramePresetId): void }) {
  return (
    <div role="radiogroup" aria-label="Frame size" className="flex min-w-60 flex-col gap-0.5">
      {PRESET_ORDER.map((id) => {
        const p = FRAME_PRESETS[id];
        const px = framePresetPx(id);
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            onClick={() => onChange(id)}
            className="flex min-h-9 items-baseline justify-between gap-4 rounded-sm px-2 py-1.5 text-left transition-[background-color] duration-(--dur-fast) ease-out pointer-coarse:min-h-11 hoverable:bg-(--color-selection-fill) aria-checked:bg-(--color-selection-fill) aria-checked:font-semibold"
          >
            <span>{p.label}</span>
            <span className="text-(length:--text-xs) font-normal text-fg-muted">
              {id === "custom" ? "Drag to size" : presetSize(id)}
              {p.unit !== "px" ? ` · ${px.w} × ${px.h} px` : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function RouteChoice({ value, onChange }: { value: "straight" | "elbow" | "curved" | null; onChange(v: "straight" | "elbow" | "curved"): void }) {
  return (
    <Choice
      label="Route"
      value={value}
      onChange={onChange}
      options={[
        { value: "straight", label: "Straight", text: "Straight" },
        { value: "elbow", label: "Elbow", text: "Elbow" },
        { value: "curved", label: "Curved", text: "Curved" },
      ]}
    />
  );
}

const HEADS: { value: Head; label: string }[] = [
  { value: "none", label: "None" },
  { value: "arrow", label: "Arrow" },
  { value: "triangle", label: "Triangle" },
  { value: "dot", label: "Dot" },
  { value: "bar", label: "Bar" },
];

export function HeadChoice({ label, value, onChange }: { label: string; value: Head | null; onChange(v: Head): void }) {
  return <Choice label={label} value={value} onChange={onChange} options={HEADS.map((h) => ({ ...h, text: h.label }))} />;
}

export const STROKE_WIDTHS = [1, 2, 4, 8] as const;

export function StrokeWidthChoice({ value, onChange }: { value: number | null; onChange(v: number): void }) {
  return (
    <Choice
      label="Width"
      value={value === null ? null : String(value)}
      onChange={(v) => onChange(Number(v))}
      options={STROKE_WIDTHS.map((w) => ({ value: String(w), label: `${w} px`, text: String(w) }))}
    />
  );
}

export function StrokeStyleChoice({ value, onChange }: { value: StrokeStyle | null; onChange(v: StrokeStyle): void }) {
  return (
    <Choice
      label="Style"
      value={value}
      onChange={onChange}
      options={[
        { value: "solid", label: "Solid", text: "Solid" },
        { value: "dashed", label: "Dashed", text: "Dashed" },
        { value: "dotted", label: "Dotted", text: "Dotted" },
      ]}
    />
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-(length:--text-xs) font-medium text-fg-muted">{label}</span>
      {children}
    </div>
  );
}
