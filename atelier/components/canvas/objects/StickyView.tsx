"use client";

import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { STICKY_COLORS, STICKY_FONT_PX, STICKY_LINE_HEIGHT } from "@/lib/engine/model/defaults";
import type { StickyObj } from "@/lib/engine/model/types";
import { EditableContent } from "./EditableContent";

/** Fixed font size per StickySize; the note grows downwards when its text needs more room than `h`. */
export function StickyView({ doc, obj }: { doc: BoardDoc; obj: StickyObj }) {
  return (
    <div
      style={{
        boxSizing: "border-box",
        width: obj.w,
        minHeight: obj.h,
        background: `var(${STICKY_COLORS[obj.fill]})`,
        color: "var(--color-ink)",
        borderRadius: "var(--radius-sm)",
        boxShadow: "var(--elev-1)",
        fontSize: STICKY_FONT_PX[obj.size],
        lineHeight: STICKY_LINE_HEIGHT,
        overflowWrap: "anywhere",
        whiteSpace: "pre-wrap",
      }}
    >
      <EditableContent doc={doc} obj={obj} padding="var(--space-4)" style={{ minHeight: obj.h }} />
    </div>
  );
}
