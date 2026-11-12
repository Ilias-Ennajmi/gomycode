export type Box = { left: number; top: number; width: number; height: number };
export type Placement = "top" | "bottom";

export type Placed = { left: number; top: number; placement: Placement; /** Where the anchor's middle is, relative to the floating box (for transform-origin). */ originX: number };

/**
 * Where a floating box (popover, tooltip, menu) goes next to its anchor, in viewport coordinates: on the preferred side
 * when it fits there, on the other side when it only fits there, and otherwise on the side with more room; then
 * clamped so it never leaves the viewport (`margin` from every edge). `align` picks which edge lines up with the
 * anchor: the centre, the start (left edge) or the end (right edge).
 */
export function placeFloating(
  anchor: Box,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  opts: {
    prefer?: Placement;
    align?: "center" | "start" | "end";
    gap?: number;
    /** Gap above / below the anchor when it differs from `gap` (room for a rotate handle above a selection). */
    gapTop?: number;
    gapBottom?: number;
    margin?: number;
    /** Keep clear of fixed chrome at the top / bottom edge (defaults to `margin`). */
    marginTop?: number;
    marginBottom?: number;
  } = {},
): Placed {
  const { prefer = "top", align = "center", gap = 8, margin = 8 } = opts;
  const gapTop = opts.gapTop ?? gap;
  const gapBottom = opts.gapBottom ?? gap;
  const marginTop = opts.marginTop ?? margin;
  const marginBottom = opts.marginBottom ?? margin;
  const roomAbove = anchor.top - gapTop - marginTop;
  const roomBelow = viewport.height - (anchor.top + anchor.height) - gapBottom - marginBottom;
  const fits = (p: Placement) => (p === "top" ? roomAbove : roomBelow) >= size.height;
  const other: Placement = prefer === "top" ? "bottom" : "top";
  let placement: Placement = prefer;
  if (!fits(prefer)) placement = fits(other) ? other : roomAbove > roomBelow ? "top" : "bottom";

  let left = align === "start" ? anchor.left : align === "end" ? anchor.left + anchor.width - size.width : anchor.left + anchor.width / 2 - size.width / 2;
  left = Math.min(Math.max(left, margin), Math.max(margin, viewport.width - size.width - margin));
  let top = placement === "top" ? anchor.top - gapTop - size.height : anchor.top + anchor.height + gapBottom;
  top = Math.min(Math.max(top, marginTop), Math.max(marginTop, viewport.height - size.height - marginBottom));
  return { left, top, placement, originX: anchor.left + anchor.width / 2 - left };
}

export const boxOf = (r: { left: number; top: number; width: number; height: number }): Box => ({ left: r.left, top: r.top, width: r.width, height: r.height });
