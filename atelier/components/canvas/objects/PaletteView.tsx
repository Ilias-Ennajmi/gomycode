"use client";

import { Lock } from "lucide-react";
import { useSyncExternalStore } from "react";
import { getHighlightStore, type HighlightStore } from "@/lib/engine/color/highlight";
import type { PaletteObj, PaletteSwatch } from "@/lib/engine/model/types";

const pct = (w: number) => `${Math.round(Math.min(1, Math.max(0, w)) * 100)}%`;

/** What a chip is called: the name when it has one, the hex, the share, and whether it is locked. */
export function chipLabel(s: PaletteSwatch, showWeights = true): string {
  return [s.name || null, s.hex, showWeights ? pct(s.weight) : null, s.locked ? "locked" : null].filter(Boolean).join(", ");
}

/**
 * A board palette: one chip per colour, side by side (or in a grid), each with its hex and its share of the board as text.
 * Clicking a colour dims the pictures that do not contain it (a second click, Escape or an empty click on the canvas
 * clears it). The colour blocks take the press; the label strips below them are left to the canvas, so the card is
 * selected and moved by its labels.
 */
export function PaletteView({ obj, store }: { obj: PaletteObj; store?: HighlightStore }) {
  const highlight = store ?? getHighlightStore();
  const active = useSyncExternalStore(highlight.subscribe, () => highlight.hex, () => null);
  const grid = obj.layout === "grid";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
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
      {obj.swatches.length === 0 ? (
        <p
          style={{ margin: "auto", padding: "var(--space-3)", fontSize: "var(--text-sm)", color: "var(--color-muted)", textAlign: "center" }}
        >
          {obj.live ? "No colours yet. Add images to the board." : "Empty palette."}
        </p>
      ) : (
        <ul
          aria-label={obj.live ? "Palette colours, live" : "Palette colours"}
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            flex: 1,
            minWidth: 0,
            display: grid ? "grid" : "flex",
            gridTemplateColumns: grid ? "repeat(auto-fill, minmax(72px, 1fr))" : undefined,
            gridAutoRows: grid ? "minmax(0, 1fr)" : undefined,
            gap: 1,
            background: "var(--color-border)",
          }}
        >
          {obj.swatches.map((s) => {
            const pressed = active !== null && active === s.hex;
            return (
              <li
                key={s.hex}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  minWidth: 0,
                  minHeight: 0,
                  flex: grid ? undefined : `${Math.max(s.weight, 0.11)} 1 0`,
                  background: "var(--color-surface)",
                }}
              >
                {/* data-editing-surface: the canvas leaves presses on this button alone, so the click reaches it. */}
                <button
                  type="button"
                  data-editing-surface=""
                  data-highlight-chip=""
                  aria-pressed={pressed}
                  aria-label={chipLabel(s, obj.showWeights)}
                  title={chipLabel(s, obj.showWeights)}
                  onClick={() => highlight.toggle(s.hex)}
                  style={{
                    pointerEvents: "auto",
                    flex: "1 1 auto",
                    minHeight: 12,
                    padding: 0,
                    border: 0,
                    background: s.hex,
                    cursor: "pointer",
                    boxShadow: pressed ? "inset 0 0 0 3px var(--color-selection), inset 0 0 0 5px var(--color-surface)" : undefined,
                  }}
                />
                <div
                  aria-hidden="true"
                  style={{
                    flex: "0 0 auto",
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "baseline",
                    gap: "0 var(--space-2)",
                    padding: "var(--space-1) var(--space-2)",
                    fontSize: "var(--text-xs)",
                    lineHeight: 1.3,
                    minWidth: 0,
                    overflow: "hidden",
                  }}
                >
                  {s.name ? (
                    <span style={{ flexBasis: "100%", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                  ) : null}
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{s.hex}</span>
                  {obj.showWeights ? <span style={{ color: "var(--color-muted)", fontVariantNumeric: "tabular-nums" }}>{pct(s.weight)}</span> : null}
                  {s.locked ? <Lock size={11} strokeWidth={2} style={{ color: "var(--color-muted)", alignSelf: "center" }} /> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
