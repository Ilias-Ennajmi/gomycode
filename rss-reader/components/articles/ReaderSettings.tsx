"use client";

import { Type } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  READER_FONTS,
  useReaderPrefs,
  type ReaderFont,
  type ReaderSpacing,
  type ReaderWidth,
} from "@/lib/hooks/useReaderPrefs";

function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: React.ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="grid grid-flow-col gap-1 rounded-lg bg-muted p-1">
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            className={cn(
              "rounded-md px-2 py-1.5 text-sm transition-colors",
              value === option.value
                ? "bg-background font-medium text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The "Aa" menu: font, text size, line width and line spacing for the reader. */
export function ReaderSettings({ className }: { className?: string }) {
  const { prefs, update } = useReaderPrefs();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("h-10 w-10", className)} aria-label="Reading settings">
          <Type className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4">
        <Segmented<ReaderFont>
          label="Font"
          value={prefs.font}
          onChange={(font) => update({ font })}
          options={(["sans", "serif", "mono"] as const).map((font) => ({
            value: font,
            label: (
              <span style={{ fontFamily: READER_FONTS[font] }}>
                {font === "sans" ? "Sans" : font === "serif" ? "Serif" : "Mono"}
              </span>
            ),
          }))}
        />
        <Segmented<number>
          label="Text size"
          value={prefs.size}
          onChange={(size) => update({ size: size as 0 | 1 | 2 | 3 })}
          options={[0, 1, 2, 3].map((size) => ({
            value: size,
            label: <span style={{ fontSize: 12 + size * 2 }}>A</span>,
          }))}
        />
        <Segmented<ReaderWidth>
          label="Line width"
          value={prefs.width}
          onChange={(width) => update({ width })}
          options={[
            { value: "narrow", label: "Narrow" },
            { value: "normal", label: "Normal" },
            { value: "wide", label: "Wide" },
          ]}
        />
        <Segmented<ReaderSpacing>
          label="Line spacing"
          value={prefs.spacing}
          onChange={(spacing) => update({ spacing })}
          options={[
            { value: "compact", label: "Tight" },
            { value: "normal", label: "Normal" },
            { value: "relaxed", label: "Airy" },
          ]}
        />
      </PopoverContent>
    </Popover>
  );
}
