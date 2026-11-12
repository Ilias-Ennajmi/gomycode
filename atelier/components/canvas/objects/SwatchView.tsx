"use client";

import { toast } from "@/components/chrome/Toast";
import { copyColorValue } from "@/lib/engine/color/copy";
import { formatColor } from "@/lib/engine/model/color";
import type { SwatchObj } from "@/lib/engine/model/types";

/**
 * A colour card: the colour, its name and its value in the chosen format. Clicking the colour copies the value (the card's
 * name strip is left to the canvas, so the card is still selected and dragged by it). Text is never colour alone: the
 * value is written under the colour.
 */
export function SwatchView({ obj }: { obj: SwatchObj }) {
  const value = formatColor(obj.hex, obj.format);
  return (
    <div
      role="group"
      aria-label={`Colour ${obj.name || obj.hex}`}
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxSizing: "border-box",
        background: "var(--color-surface)",
        color: "var(--color-ink)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-sm)",
        boxShadow: "var(--elev-1)",
        fontFamily: "var(--font-ui)",
      }}
    >
      {/* data-editing-surface: the canvas leaves presses on this button alone, so the click reaches it. */}
      <button
        type="button"
        data-editing-surface=""
        aria-label={`Copy ${value}`}
        title={`Copy ${value}`}
        onClick={() => void copyColorValue(value, toast)}
        style={{
          pointerEvents: "auto",
          flex: "1 1 auto",
          minHeight: 0,
          width: "100%",
          padding: 0,
          border: 0,
          borderBottom: "1px solid var(--color-border)",
          background: obj.hex,
          cursor: "copy",
        }}
      />
      <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 2, padding: "var(--space-2) var(--space-3)", minWidth: 0 }}>
        {obj.name ? (
          <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{obj.name}</span>
        ) : null}
        <span style={{ fontSize: "var(--text-xs)", color: "var(--color-muted)", lineHeight: 1.25, overflowWrap: "anywhere", fontVariantNumeric: "tabular-nums" }}>
          {value}
        </span>
      </div>
    </div>
  );
}
