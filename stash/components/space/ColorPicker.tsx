"use client";

import { Check } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { cx } from "@/components/ui/cx";
import { SPACE_BG, SPACE_COLORS, SPACE_LABEL, type SpaceColor } from "@/components/ui/space";

/** The Space palette as a row of 48px swatches (Inbox grey is reserved for the Inbox). */
export function SpaceColorSwatches({ value, onChange }: { value: SpaceColor; onChange: (c: SpaceColor) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
      {SPACE_COLORS.filter((c) => c !== "inbox").map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-label={SPACE_LABEL[c]}
          aria-checked={value === c}
          onClick={() => onChange(c)}
          className={cx(
            "flex h-12 w-12 items-center justify-center rounded-full",
            SPACE_BG[c],
            value === c && "ring-2 ring-fg ring-offset-2 ring-offset-surface",
          )}
        >
          {value === c && <Check size={20} strokeWidth={2} aria-hidden className="text-background" />}
        </button>
      ))}
    </div>
  );
}

/** Long-press a Space chip: pick its colour in one tap. */
export function SpaceColorSheet({
  open,
  onClose,
  name,
  value,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  value: SpaceColor;
  onPick: (c: SpaceColor) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} label={`Colour of ${name}`} title={`Colour of ${name}`}>
      <SpaceColorSwatches
        value={value}
        onChange={(c) => {
          onPick(c);
          onClose();
        }}
      />
    </Sheet>
  );
}
