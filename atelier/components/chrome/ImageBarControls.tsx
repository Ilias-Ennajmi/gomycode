"use client";

import { Check, Circle, Contrast, Crop, FlipVertical2, FlipHorizontal2, Replace, Square, SquareRoundCorner, X } from "lucide-react";
import { useActiveToolId } from "@/components/canvas/useStores";
import { useEditor } from "@/components/editor/EditorContext";
import { NumberField } from "@/components/panels/NumberField";
import { CROP_PRESETS } from "@/lib/engine/images/crop";
import { setMask } from "@/lib/engine/images/ops";
import type { ImageObj } from "@/lib/engine/model/types";
import { BarPopoverButton } from "./bar-popover";
import { Choice, IconButton, chromeButton } from "./controls";
import { Tip } from "./Tip";

const MASKS = [
  { value: "rect", label: "Rectangle mask", icon: Square },
  { value: "rounded", label: "Rounded mask", icon: SquareRoundCorner },
  { value: "circle", label: "Circle mask", icon: Circle },
] as const;

const uniform = <T,>(values: T[]): T | undefined => (values.length > 0 && values.every((v) => v === values[0]) ? values[0] : undefined);

/** Mask kind and corner radius of the selected images (shared by the context bar and the Inspector). */
export function MaskFields({ images }: { images: ImageObj[] }) {
  const { doc } = useEditor().handle;
  const ids = images.map((o) => o.id);
  const kind = uniform(images.map((o) => o.mask.kind));
  const radius = uniform(images.map((o) => o.mask.radius));
  return (
    <div className="flex w-56 flex-col gap-3">
      <Choice
        label="Mask"
        value={kind ?? null}
        options={MASKS.map((m) => ({ value: m.value, label: m.label, icon: m.icon }))}
        onChange={(k) => {
          const r = k === "rounded" && !(radius && radius > 0) ? 24 : (radius ?? 0);
          setMask(doc, ids, { kind: k, radius: r });
        }}
      />
      {kind === "rounded" || kind === undefined ? (
        <>
          <NumberField
            label="Radius"
            value={radius ?? null}
            unit="px"
            min={0}
            max={400}
            onCommit={(v, merge) => setMask(doc, ids, { kind: "rounded", radius: v }, { merge })}
          />
          <input
            type="range"
            aria-label="Corner radius slider"
            min={0}
            max={200}
            value={Math.min(200, radius ?? 0)}
            onChange={(e) => setMask(doc, ids, { kind: "rounded", radius: Number(e.target.value) }, { merge: true })}
            className="h-6 w-full accent-(--color-selection) pointer-coarse:h-11"
          />
        </>
      ) : null}
    </div>
  );
}

/** The aspect presets as a list of buttons: each runs `image.cropPreset.*`. */
export function CropPresetButtons({ onRun }: { onRun?: () => void }) {
  const { run } = useEditor();
  return (
    <div role="group" aria-label="Crop aspect" className="grid grid-cols-3 gap-1">
      {CROP_PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => {
            run(`image.cropPreset.${p.id}`);
            onRun?.();
          }}
          className={`${chromeButton} !w-auto min-w-12 px-2 text-(length:--text-xs) font-medium border border-line`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The "Image" section of the selection bar: crop, aspect presets, mask and corner radius, grayscale, flip and replace.
 * Everything runs registry commands or the image ops, so menus, the palette and the bar stay in step.
 */
export function ImageBarControls({ images, side }: { images: ImageObj[]; side: "top" | "bottom" }) {
  const { run, handle } = useEditor();
  const cropping = useActiveToolId(handle.tools) === "crop";
  const gray = images.every((o) => o.grayscale);
  const kind = uniform(images.map((o) => o.mask.kind));
  const MaskIcon = MASKS.find((m) => m.value === kind)?.icon ?? Square;
  const one = images.length === 1;
  return (
    <>
      {cropping ? (
        <>
          <IconButton label="Apply crop" icon={Check} shortcut="Enter" tipSide={side} onClick={() => run("image.cropApply")} />
          <IconButton label="Cancel crop" icon={X} shortcut="Escape" tipSide={side} onClick={() => run("image.cropCancel")} />
        </>
      ) : one ? (
        <IconButton label="Crop" icon={Crop} shortcut="C" tipSide={side} onClick={() => run("image.crop")} />
      ) : null}
      <BarPopoverButton label="Crop aspect" side={side} face={<span className="px-0.5 text-(length:--text-xs) font-semibold">Aspect</span>}>
        {(close) => <CropPresetButtons onRun={close} />}
      </BarPopoverButton>
      <BarPopoverButton label={`Mask: ${kind ?? "mixed"}`} popoverLabel="Mask" side={side} face={<MaskIcon aria-hidden="true" size={18} strokeWidth={1.75} />}>
        <MaskFields images={images} />
      </BarPopoverButton>
      <IconButton label="Grayscale" icon={Contrast} pressed={gray} tipSide={side} onClick={() => run("image.grayscale")} />
      <IconButton label="Flip horizontally" icon={FlipVertical2} tipSide={side} onClick={() => run("image.flipH")} />
      <IconButton label="Flip vertically" icon={FlipHorizontal2} tipSide={side} onClick={() => run("image.flipV")} />
      {one ? (
        <Tip label="Replace image" side={side}>
          <button type="button" aria-label="Replace image" onClick={() => run("image.replace")} className={chromeButton}>
            <Replace aria-hidden="true" size={18} strokeWidth={1.75} />
          </button>
        </Tip>
      ) : null}
    </>
  );
}
