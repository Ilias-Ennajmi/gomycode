import { CROP_PRESETS, cropForAspect, type CropPresetId } from "../images/crop";
import { applyCrop, flipImages, imageSource, replaceImageAsset, setGrayscale, setMask } from "../images/ops";
import type { CropTool } from "../input/tools/crop";
import { oneStepOn, undoIfLatest } from "../model/one-step";
import type { ImageObj, MaskKind } from "../model/types";
import type { AssetUploader } from "@/lib/assets/upload-queue";
import type { Command, CommandCtx } from "./registry";

/** Radius a mask gets when the picture is first made rounded. */
export const DEFAULT_MASK_RADIUS = 24;

/** The selected images that can be edited (not locked). */
export function selectedImages(ctx: CommandCtx): ImageObj[] {
  return [...ctx.selection.ids].flatMap((id) => {
    const o = ctx.doc.get(id);
    return o && o.type === "image" && !o.locked ? [o] : [];
  });
}

const hasImages = (c: CommandCtx) => selectedImages(c).length > 0;
const oneImage = (c: CommandCtx) => c.selection.size === 1 && selectedImages(c).length === 1;

const cropTool = (c: CommandCtx): CropTool | undefined => c.canvas.tools?.get<CropTool>("crop");
const cropping = (c: CommandCtx) => c.canvas.tools?.id === "crop";

/** Apply or discard the crop in progress and make sure the Select tool is active again. */
function leaveCrop(ctx: CommandCtx, how: "commit" | "cancel"): void {
  const tool = cropTool(ctx);
  if (how === "commit") tool?.commit();
  else tool?.cancel();
  if (cropping(ctx)) ctx.setTool("select");
}

function applyPreset(ctx: CommandCtx, preset: CropPresetId): void {
  const ratio = CROP_PRESETS.find((p) => p.id === preset)?.ratio ?? null;
  if (cropping(ctx)) {
    cropTool(ctx)?.setPreset(preset);
    return;
  }
  if (ratio === null) {
    if (oneImage(ctx)) ctx.setTool("crop"); // "free" is the interactive crop
    return;
  }
  const targets = selectedImages(ctx);
  oneStepOn(ctx.doc, () => {
    for (const o of targets) {
      const src = imageSource(o, ctx.assets);
      applyCrop(ctx.doc, o.id, cropForAspect(src, o.crop, ratio), src);
    }
  });
}

function setMaskKind(ctx: CommandCtx, kind: MaskKind): void {
  const targets = selectedImages(ctx);
  if (targets.length === 0) return;
  oneStepOn(ctx.doc, () => {
    for (const o of targets) {
      const radius = kind === "rounded" ? (o.mask.radius > 0 ? o.mask.radius : DEFAULT_MASK_RADIUS) : o.mask.radius;
      setMask(ctx.doc, [o.id], { kind, radius });
    }
  });
}

/**
 * Replace the picture of image `id` with `file`: the file goes through the asset pipeline (AssetUploader.addAssetOnly),
 * then the image points at the new asset keeping its box, mask, opacity and, as far as the new picture allows, crop.
 * A failed upload leaves the old picture in place. Returns whether the image was replaced.
 */
export async function replaceImageWithFile(
  ctx: CommandCtx,
  id: string,
  file: Blob,
  uploader: Pick<AssetUploader, "addAssetOnly">,
): Promise<boolean> {
  const before = ctx.doc.get(id);
  if (!before || before.type !== "image" || before.locked) return false;
  const oldSrc = imageSource(before, ctx.assets);
  let assetId: string;
  try {
    assetId = await uploader.addAssetOnly(file, { name: (file as File).name });
  } catch (e) {
    const why = e instanceof Error && e.message ? e.message : "The file could not be read";
    ctx.toast({ message: `Could not replace the image: ${why}` });
    return false;
  }
  const cur = ctx.doc.get(id);
  if (!cur || cur.type !== "image" || cur.locked) return false;
  const known = ctx.assets?.available(assetId);
  const newSrc = known && known.width > 0 && known.height > 0 ? { w: known.width, h: known.height } : oldSrc;
  ctx.doc.stopCapturing();
  replaceImageAsset(ctx.doc, id, assetId, oldSrc, newSrc);
  const stack = ctx.doc.undoManager.undoStack;
  const mine = stack[stack.length - 1];
  ctx.toast({ message: "Image replaced", action: { label: "Undo", run: () => void undoIfLatest(ctx.doc, mine) } });
  return true;
}

export const IMAGE_COMMANDS: Command[] = [
  { id: "image.cropApply", label: "Apply crop", group: "edit", when: cropping, run: (c) => leaveCrop(c, "commit") },
  { id: "image.cropCancel", label: "Cancel crop", group: "edit", shortcut: "Escape", when: cropping, run: (c) => leaveCrop(c, "cancel") },
  { id: "image.crop", label: "Crop image", group: "edit", shortcut: "C", when: oneImage, run: (c) => c.setTool("crop") },
  ...CROP_PRESETS.map(
    (p): Command => ({
      id: `image.cropPreset.${p.id}`,
      label: p.id === "free" ? "Crop: free" : `Crop to ${p.label}`,
      group: "edit",
      when: p.ratio === null ? oneImage : hasImages,
      run: (c) => applyPreset(c, p.id),
    }),
  ),
  ...(["rect", "rounded", "circle"] as const).map(
    (kind): Command => ({
      id: `image.mask.${kind}`,
      label: kind === "rect" ? "Mask: rectangle" : kind === "rounded" ? "Mask: rounded" : "Mask: circle",
      group: "edit",
      when: hasImages,
      run: (c) => setMaskKind(c, kind),
    }),
  ),
  {
    id: "image.grayscale",
    label: "Grayscale",
    group: "edit",
    when: hasImages,
    run: (c) => {
      const imgs = selectedImages(c);
      setGrayscale(c.doc, imgs.map((o) => o.id), !imgs.every((o) => o.grayscale));
    },
  },
  { id: "image.flipH", label: "Flip image horizontally", group: "edit", when: hasImages, run: (c) => flipImages(c.doc, selectedImages(c).map((o) => o.id), "x") },
  { id: "image.flipV", label: "Flip image vertically", group: "edit", when: hasImages, run: (c) => flipImages(c.doc, selectedImages(c).map((o) => o.id), "y") },
  {
    id: "image.replace",
    label: "Replace image",
    group: "edit",
    when: (c) => oneImage(c) && !!c.ui?.replaceImage,
    run: (c) => {
      const only = selectedImages(c)[0];
      if (only) c.ui?.replaceImage?.(only.id);
    },
  },
  {
    id: "view.valueCheck",
    label: "Toggle value check (grayscale preview)",
    group: "view",
    run: (c) => {
      c.doc.meta.valueCheck = !c.doc.meta.valueCheck;
      c.toast({ message: c.doc.meta.valueCheck ? "Value check on" : "Value check off", durationMs: 2000 });
    },
  },
];
