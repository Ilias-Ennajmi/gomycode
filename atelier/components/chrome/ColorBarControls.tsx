"use client";

import { Copy, Palette, Radio } from "lucide-react";
import { useEditor } from "@/components/editor/EditorContext";
import { COLOR_FORMAT_LABELS } from "@/lib/engine/color/palette-ops";
import type { PaletteObj, SwatchObj } from "@/lib/engine/model/types";
import { chromeTextButton } from "./controls";
import { Tip } from "./Tip";

/** Selection bar for one colour card: copy the value, and change the format it is written in (HEX, RGB, HSL, OKLCH). */
export function SwatchBarControls({ obj, side }: { obj: SwatchObj; side: "top" | "bottom" }) {
  const { run } = useEditor();
  const format = COLOR_FORMAT_LABELS[obj.format];
  return (
    <>
      <Tip label="Copy colour value" side={side}>
        <button type="button" aria-label="Copy colour value" onClick={() => void run("swatch.copy")} className={chromeTextButton}>
          <Copy aria-hidden="true" size={18} strokeWidth={1.75} />
          <span className="hidden text-(length:--text-sm) sm:inline">Copy</span>
        </button>
      </Tip>
      <Tip label="Change colour format" side={side}>
        <button type="button" aria-label={`Colour format ${format}. Change`} onClick={() => void run("swatch.cycleFormat")} className={chromeTextButton}>
          <span className="text-(length:--text-sm) font-medium tabular-nums">{format}</span>
        </button>
      </Tip>
    </>
  );
}

/** Selection bar for one palette: live or fixed, and the way into the Palette panel (rename, lock, export). */
export function PaletteBarControls({ obj, side }: { obj: PaletteObj; side: "top" | "bottom" }) {
  const { run, panels } = useEditor();
  return (
    <>
      <Tip label={obj.live ? "Live: follows the pictures. Click to fix it" : "Fixed. Click to make it follow the pictures"} side={side}>
        <button type="button" aria-label="Live palette" aria-pressed={obj.live} onClick={() => void run("palette.toggleLive")} className={chromeTextButton}>
          <Radio aria-hidden="true" size={18} strokeWidth={1.75} />
          <span className="hidden text-(length:--text-sm) sm:inline">Live</span>
        </button>
      </Tip>
      <Tip label="Palette panel" side={side}>
        <button type="button" aria-label="Palette panel" aria-pressed={panels.openId === "palette"} onClick={() => panels.toggle("palette")} className={chromeTextButton}>
          <Palette aria-hidden="true" size={18} strokeWidth={1.75} />
          <span className="hidden text-(length:--text-sm) sm:inline">Colours</span>
        </button>
      </Tip>
    </>
  );
}
