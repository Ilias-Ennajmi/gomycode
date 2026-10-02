"use client";

import type { ReactNode } from "react";
import { Segmented } from "@/components/ui/Segmented";
import { Slider } from "@/components/ui/Slider";
import { Switch } from "@/components/ui/Switch";
import { AccentPicker } from "./AccentPicker";
import { PreviewCard } from "./PreviewCard";
import { ThemePicker } from "./ThemePicker";
import { useAppearance } from "./ThemeProvider";

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-body text-label text-fg-muted">{title}</h3>
      {children}
    </section>
  );
}

/** Settings → Appearance. Every change applies instantly and syncs in the background. */
export function AppearanceControls() {
  const { appearance, update } = useAppearance();
  return (
    <div className="flex flex-col gap-6">
      <PreviewCard />
      <Group title="Theme">
        <ThemePicker />
      </Group>
      <Group title="Accent colour">
        <AccentPicker />
      </Group>
      <Group title="Display">
        <Slider
          label="Text size"
          value={Math.round(appearance.textScale * 100)}
          onChange={(v) => update({ textScale: v / 100 })}
        />
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span className="text-body text-fg">
            Grid density
          </span>
          <Segmented
            label="Grid density"
            options={[
              { value: "2", label: "2 columns" },
              { value: "3", label: "3 columns" },
            ]}
            value={String(appearance.density) as "2" | "3"}
            onChange={(v) => update({ density: v === "3" ? 3 : 2 })}
          />
        </div>
        <Switch
          label="Reduce motion"
          description="Turns off animations and transitions."
          checked={appearance.reduceMotion}
          onChange={(reduceMotion) => update({ reduceMotion })}
        />
        <Switch
          label="Haptics"
          description="A short tick on save, keep, archive and grades."
          checked={appearance.haptics}
          onChange={(haptics) => update({ haptics })}
        />
      </Group>
    </div>
  );
}
