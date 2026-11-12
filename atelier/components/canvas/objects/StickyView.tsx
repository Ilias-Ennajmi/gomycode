"use client";

import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { STICKY_COLORS, STICKY_FONT_PX } from "@/lib/engine/model/defaults";
import type { StickyObj } from "@/lib/engine/model/types";
import { RichContent } from "./RichContent";

/** Fixed font size per StickySize; the note grows downwards when its text needs more room than `h`. */
export function StickyView({ doc, obj }: { doc: BoardDoc; obj: StickyObj }) {
  return (
    <div
      style={{
        boxSizing: "border-box",
        width: obj.w,
        minHeight: obj.h,
        padding: "var(--space-4)",
        background: `var(${STICKY_COLORS[obj.fill]})`,
        color: "var(--color-ink)",
        borderRadius: "var(--radius-sm)",
        boxShadow: "var(--elev-1)",
        fontSize: STICKY_FONT_PX[obj.size],
        lineHeight: 1.3,
        overflowWrap: "anywhere",
      }}
    >
      <RichContent doc={doc} obj={obj} />
    </div>
  );
}
