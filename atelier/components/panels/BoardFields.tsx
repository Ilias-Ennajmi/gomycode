"use client";

import { useEditor } from "@/components/editor/EditorContext";
import { useShowCredits } from "@/components/canvas/useShowCredits";
import { useValueCheck } from "@/components/canvas/useValueCheck";
import { NumberField } from "./NumberField";
import { setGutter, setShowCredits, setValueCheck, useGutter } from "./board-meta";

/** The gap the layout tools leave between objects. Board-wide; not an undo step (like the board title). */
export function GutterField() {
  const { doc } = useEditor().handle;
  const gutter = useGutter(doc);
  return <NumberField label="Gutter" value={gutter} unit="px" min={0} max={200} onCommit={(v) => setGutter(doc, v)} />;
}

/**
 * Board settings in the Inspector: the layout gutter and the value check (a grayscale preview of the whole board; it
 * changes how the board looks here, never the board itself, and is not an undo step).
 */
export function BoardFields() {
  const { doc } = useEditor().handle;
  const valueCheck = useValueCheck(doc);
  const showCredits = useShowCredits(doc);
  return (
    <section aria-label="Board" className="grid gap-2">
      <p className="text-(length:--text-xs) font-medium text-fg-muted">Board</p>
      <GutterField />
      <button
        type="button"
        role="switch"
        aria-label="Value check"
        aria-checked={valueCheck}
        onClick={() => setValueCheck(doc, !valueCheck)}
        className="inline-flex min-h-(--target-min) w-full items-center justify-between gap-2 rounded-sm border border-line px-2 text-left text-(length:--text-sm) text-fg transition-[transform,background-color] duration-(--dur-fast) ease-out active:scale-[0.97] aria-checked:bg-(--color-selection-fill) hoverable:border-fg-muted"
      >
        <span>Value check</span>
        <span className="text-(length:--text-xs) text-fg-muted">{valueCheck ? "On" : "Off"}</span>
      </button>
      <button
        type="button"
        role="switch"
        aria-label="Show credits"
        aria-checked={showCredits}
        onClick={() => setShowCredits(doc, !showCredits)}
        className="inline-flex min-h-(--target-min) w-full items-center justify-between gap-2 rounded-sm border border-line px-2 text-left text-(length:--text-sm) text-fg transition-[transform,background-color] duration-(--dur-fast) ease-out active:scale-[0.97] aria-checked:bg-(--color-selection-fill) hoverable:border-fg-muted"
      >
        <span>Show credits</span>
        <span className="text-(length:--text-xs) text-fg-muted">{showCredits ? "On" : "Off"}</span>
      </button>
    </section>
  );
}
