import { getAssetMetaStore } from "@/lib/assets/meta-store";
import { aggregatePalette } from "../color/aggregate";
import { copyColorValue } from "../color/copy";
import { eyeDropperAvailable, pickScreenColor } from "../color/eyedropper";
import { getHighlightStore } from "../color/highlight";
import { createPalette, createSwatchCard, nextColorFormat } from "../color/palette-ops";
import { formatColor } from "../model/color";
import { oneStepOn } from "../model/one-step";
import type { ImageObj, PaletteObj, SwatchObj } from "../model/types";
import { viewCentre } from "./media-commands";
import type { Command, CommandCtx } from "./registry";

const selected = <T extends { type: string }>(c: CommandCtx, type: T["type"]): T[] => {
  const out: T[] = [];
  for (const id of c.selection.ids) {
    const o = c.doc.get(id);
    if (o?.type === type) out.push(o as unknown as T);
  }
  return out;
};
const selectedPalettes = (c: CommandCtx) => selected<PaletteObj>(c, "palette");
const selectedSwatches = (c: CommandCtx) => selected<SwatchObj>(c, "swatch");
const selectedImages = (c: CommandCtx) => selected<ImageObj>(c, "image");

/** Colour as a first-class object: the live board palette, colour cards, the highlight, copy and format. */
export const PALETTE_COMMANDS: Command[] = [
  {
    id: "insert.palette",
    label: "Palette",
    group: "insert",
    run: (c) => c.selection.set([createPalette(c.doc, viewCentre(c))]),
  },
  {
    id: "insert.swatch",
    label: "Colour swatch",
    group: "insert",
    run: (c) => c.selection.set([createSwatchCard(c.doc, viewCentre(c), { hex: getHighlightStore().hex ?? "#808080" })]),
  },
  {
    id: "swatch.pick",
    label: "Pick a colour from the screen",
    group: "insert",
    when: () => eyeDropperAvailable(),
    run: (c) => {
      void pickScreenColor().then((hex) => {
        if (hex) c.selection.set([createSwatchCard(c.doc, viewCentre(c), { hex })]);
      });
    },
  },
  {
    id: "palette.fromSelection",
    label: "Palette from selected images",
    group: "insert",
    when: (c) => selectedImages(c).length > 0,
    run: (c) => {
      const meta = getAssetMetaStore();
      const inputs = selectedImages(c).flatMap((i) => {
        const palette = meta.get(i.assetId)?.palette;
        return palette ? [{ palette, area: i.w * i.h }] : [];
      });
      if (inputs.length === 0) {
        c.toast({ message: "Those images have no colours yet. Try again in a moment." });
        return;
      }
      const swatches = aggregatePalette(inputs, { maxColors: 8, locked: [] });
      c.selection.set([createPalette(c.doc, viewCentre(c), { live: false, swatches })]);
    },
  },
  {
    id: "palette.toggleLive",
    label: "Make palette live or fixed",
    group: "edit",
    when: (c) => selectedPalettes(c).some((p) => !p.locked),
    run: (c) => {
      const targets = selectedPalettes(c).filter((p) => !p.locked);
      const next = !targets.every((p) => p.live);
      oneStepOn(c.doc, () => targets.forEach((p) => c.doc.update(p.id, { live: next })));
    },
  },
  {
    id: "palette.clearHighlight",
    label: "Clear colour highlight",
    group: "view",
    when: () => getHighlightStore().hex !== null,
    run: () => getHighlightStore().set(null),
  },
  {
    id: "swatch.copy",
    label: "Copy colour value",
    group: "edit",
    when: (c) => selectedSwatches(c).length === 1,
    run: (c) => {
      const [s] = selectedSwatches(c);
      void copyColorValue(formatColor(s.hex, s.format), c.toast);
    },
  },
  {
    id: "swatch.cycleFormat",
    label: "Cycle colour format",
    group: "edit",
    when: (c) => selectedSwatches(c).some((s) => !s.locked),
    run: (c) => {
      const targets = selectedSwatches(c).filter((s) => !s.locked);
      oneStepOn(c.doc, () => targets.forEach((s) => c.doc.update(s.id, { format: nextColorFormat(s.format) })));
    },
  },
  { id: "view.palettePanel", label: "Palette panel", group: "view", when: (c) => !!c.ui?.togglePanel, run: (c) => c.ui?.togglePanel?.("palette") },
];
