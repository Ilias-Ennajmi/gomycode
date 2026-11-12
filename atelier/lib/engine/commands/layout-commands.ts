import { boundsOf, unionRects } from "../geometry/rect";
import { applyTransform, beginSession } from "../input/transform-ops";
import {
  layoutGrid,
  layoutJustified,
  layoutMasonry,
  layoutPack,
  normaliseSize,
  tidy,
  type LayoutItem,
  type Placement,
} from "../layout/arrange";
import { oneStepOn } from "../model/one-step";
import type { Command, CommandCtx } from "./registry";
import { selectedRoots } from "./selection-roots";

export type LayoutKind = "grid" | "masonry" | "justified" | "pack" | "normaliseHeights" | "normaliseWidths" | "tidy";

export type LayoutOptions = {
  /** Grid and masonry. Default: ceil(sqrt(n)). */
  columns?: number;
  /** Justified rows. Default: the median height of the selection. */
  targetRowHeight?: number;
};

/** How long positions glide after a pointer-triggered layout (CSS `[data-layout-animate]`, off under reduced motion). */
const GLIDE_MS = 420;
/** Narrowest a justified layout is made when the selection itself is narrower (a vertical stack). */
const MIN_JUSTIFIED_WIDTH = 480;

export const defaultColumns = (n: number): number => Math.max(1, Math.ceil(Math.sqrt(n)));

/** What a layout moves: the selected, unlocked roots (a frame or group stands for its contents); arrows follow their ends. */
export function layoutTargets(ctx: CommandCtx) {
  return selectedRoots(ctx.doc, ctx.selection.ids).filter((o) => o.type !== "arrow");
}

const available = (c: CommandCtx) => layoutTargets(c).length >= 2;

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function compute(kind: LayoutKind, items: LayoutItem[], gutter: number, opts: LayoutOptions): Placement[] {
  const box = unionRects(items.map((i) => ({ x: i.x, y: i.y, w: i.w, h: i.h })))!;
  switch (kind) {
    case "grid":
      return layoutGrid(items, { columns: opts.columns ?? defaultColumns(items.length), gutter });
    case "masonry":
      return layoutMasonry(items, { columns: opts.columns ?? defaultColumns(items.length), gutter });
    case "justified":
      return layoutJustified(items, {
        targetRowHeight: opts.targetRowHeight ?? median(items.map((i) => i.h)),
        gutter,
        width: Math.max(box.w, MIN_JUSTIFIED_WIDTH),
      });
    case "pack":
      return layoutPack(items, { gutter });
    case "normaliseHeights":
      return normaliseSize(items, { by: "height", target: "median" });
    case "normaliseWidths":
      return normaliseSize(items, { by: "width", target: "median" });
    case "tidy":
      return tidy(items, { gutter });
  }
}

/**
 * Arrange the selection (gap = the board's gutter) as one undo step. Every object keeps its aspect: it is moved, or
 * scaled uniformly, so its axis-aligned bounds land on the computed rect (a rotated object keeps its rotation).
 * A pointer-triggered run (`ctx.animate`) lets positions glide; commands from the keyboard are instant.
 */
export function runLayout(ctx: CommandCtx, kind: LayoutKind, opts: LayoutOptions = {}): boolean {
  const roots = layoutTargets(ctx);
  if (roots.length < 2) return false;
  const bounds = new Map(roots.map((o) => [o.id, boundsOf(o)]));
  const items: LayoutItem[] = roots.map((o) => {
    const b = bounds.get(o.id)!;
    return { id: o.id, x: b.x, y: b.y, w: b.w, h: b.h };
  });
  const placements = compute(kind, items, ctx.doc.meta.gutter, opts);

  if (ctx.animate) glide(ctx);
  oneStepOn(ctx.doc, () => {
    for (const p of placements) {
      const b = bounds.get(p.id);
      if (!b) continue;
      const s = b.w > 0 && Number.isFinite(p.w) ? p.w / b.w : 1;
      const moved = Math.abs(p.x - b.x) > 1e-9 || Math.abs(p.y - b.y) > 1e-9;
      const scaled = Math.abs(s - 1) > 1e-9;
      if (!moved && !scaled) continue;
      applyTransform(ctx.doc, beginSession(ctx.doc, [p.id]), {
        map: (pt) => ({ x: p.x + (pt.x - b.x) * s, y: p.y + (pt.y - b.y) * s }),
        sx: s,
        sy: s,
        dRot: 0,
      });
    }
  });
  return true;
}

function glide(ctx: CommandCtx): void {
  const el = ctx.canvas.container?.();
  if (!el || typeof window === "undefined") return;
  el.setAttribute("data-layout-animate", "true");
  window.setTimeout(() => el.removeAttribute("data-layout-animate"), GLIDE_MS);
}

const LAYOUTS: { kind: LayoutKind; label: string }[] = [
  { kind: "grid", label: "Layout: grid" },
  { kind: "masonry", label: "Layout: masonry" },
  { kind: "justified", label: "Layout: justified rows" },
  { kind: "pack", label: "Layout: tight pack" },
  { kind: "normaliseHeights", label: "Layout: make heights equal" },
  { kind: "normaliseWidths", label: "Layout: make widths equal" },
  { kind: "tidy", label: "Layout: tidy (keep grid)" },
];

/** `arrange.layout.*`: available with two or more unlocked objects selected. No shortcuts (the Layout popover and the palette). */
export const LAYOUT_COMMANDS: Command[] = LAYOUTS.map(
  ({ kind, label }): Command => ({ id: `arrange.layout.${kind}`, label, group: "arrange", when: available, run: (c) => void runLayout(c, kind) }),
);
