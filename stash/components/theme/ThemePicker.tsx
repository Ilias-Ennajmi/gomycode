"use client";

import type { ThemePref } from "@/lib/theme/appearance";
import { Segmented, type SegmentedOption } from "@/components/ui/Segmented";
import { useAppearance } from "./ThemeProvider";

const OPTIONS: ReadonlyArray<SegmentedOption<ThemePref>> = [
  { value: "system", label: "System" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "black", label: "Black" },
];

export function ThemePicker({ className }: { className?: string }) {
  const { appearance, update } = useAppearance();
  return (
    <Segmented
      label="Theme"
      options={OPTIONS}
      value={appearance.theme}
      onChange={(theme) => update({ theme })}
      fullWidth
      className={className}
    />
  );
}
