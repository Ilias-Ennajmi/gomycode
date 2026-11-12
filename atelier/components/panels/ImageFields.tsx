"use client";

import { Contrast, FlipVertical2, FlipHorizontal2, Replace } from "lucide-react";
import { useEffect, useReducer } from "react";
import { CropPresetButtons, MaskFields } from "@/components/chrome/ImageBarControls";
import { useEditor } from "@/components/editor/EditorContext";
import { clampCrop } from "@/lib/engine/images/crop";
import { applyCrop, imageSource } from "@/lib/engine/images/ops";
import type { CropTool } from "@/lib/engine/input/tools/crop";
import type { ImageObj, Rect } from "@/lib/engine/model/types";
import { NumberField } from "./NumberField";

const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };
const pct = (v: number) => Math.round(v * 1000) / 10;

const actionButton =
  "inline-flex min-h-(--target-min) items-center gap-2 rounded-sm border border-line px-2 text-(length:--text-sm) text-fg transition-[transform,background-color] duration-(--dur-fast) ease-out active:scale-[0.97] disabled:opacity-60 aria-pressed:bg-(--color-selection-fill) hoverable:border-fg-muted";

/**
 * Inspector section for one image: the crop window as numbers (the keyboard alternative to dragging), the aspect
 * presets, mask and radius, grayscale, flip and replace.
 */
export function ImageFields({ obj, disabled }: { obj: ImageObj; disabled?: boolean }) {
  const { handle, run, commandCtx } = useEditor();
  const { doc, tools } = handle;
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => tools.subscribe(bump), [tools]);
  const tool = tools.get<CropTool>("crop");
  const cropping = tools.id === "crop" && tool?.state?.id === obj.id;
  useEffect(() => (cropping && tool ? tool.subscribe(bump) : undefined), [cropping, tool]);

  const win: Rect = cropping ? tool!.state!.win : (obj.crop ?? FULL);
  const setWin = (patch: Partial<Rect>, merge: boolean) => {
    const next = clampCrop({ ...win, ...patch });
    if (cropping) {
      tool!.setWindow(next);
      return;
    }
    void merge;
    applyCrop(doc, obj.id, next, imageSource(obj, commandCtx().assets));
  };

  return (
    <>
      <p className="text-(length:--text-xs) font-medium text-fg-muted">Crop</p>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Crop X" value={pct(win.x)} unit="%" min={0} max={100} disabled={disabled} onCommit={(v, m) => setWin({ x: v / 100 }, m)} />
        <NumberField label="Crop Y" value={pct(win.y)} unit="%" min={0} max={100} disabled={disabled} onCommit={(v, m) => setWin({ y: v / 100 }, m)} />
        <NumberField label="Crop W" value={pct(win.w)} unit="%" min={2} max={100} disabled={disabled} onCommit={(v, m) => setWin({ w: v / 100 }, m)} />
        <NumberField label="Crop H" value={pct(win.h)} unit="%" min={2} max={100} disabled={disabled} onCommit={(v, m) => setWin({ h: v / 100 }, m)} />
      </div>
      {disabled ? null : <CropPresetButtons />}
      {disabled ? null : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={actionButton} onClick={() => run("image.crop")} aria-pressed={cropping}>
            Crop on canvas
          </button>
        </div>
      )}
      <p className="pt-2 text-(length:--text-xs) font-medium text-fg-muted">Mask</p>
      {disabled ? null : <MaskFields images={[obj]} />}
      {disabled ? null : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={actionButton} aria-pressed={obj.grayscale} onClick={() => run("image.grayscale")}>
            <Contrast aria-hidden="true" size={16} />
            <span>Grayscale</span>
          </button>
          <button type="button" className={actionButton} onClick={() => run("image.flipH")}>
            <FlipVertical2 aria-hidden="true" size={16} />
            <span>Flip horizontally</span>
          </button>
          <button type="button" className={actionButton} onClick={() => run("image.flipV")}>
            <FlipHorizontal2 aria-hidden="true" size={16} />
            <span>Flip vertically</span>
          </button>
          <button type="button" className={actionButton} onClick={() => run("image.replace")}>
            <Replace aria-hidden="true" size={16} />
            <span>Replace</span>
          </button>
        </div>
      )}
    </>
  );
}
