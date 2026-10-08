"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { SpaceChip } from "@/components/ui/SpaceChip";
import { Chip } from "@/components/ui/Chip";
import { cx } from "@/components/ui/cx";
import type { Space } from "@/lib/data";

/**
 * A row of Space chips plus "+ New". One tap files the save; tapping the
 * selected chip again un-files it. The new-Space field opens inline.
 */
export function SpacePicker({
  spaces,
  selectedId,
  suggestedId,
  onPick,
  onCreate,
  className,
}: {
  spaces: Space[];
  selectedId: string | null;
  suggestedId?: string | null;
  onPick: (spaceId: string | null) => void;
  onCreate: (name: string) => Promise<void>;
  className?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onCreate(name.trim());
      setName("");
      setAdding(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <div className="scroll-area -mx-5 flex gap-1 overflow-x-auto px-4">
        {spaces.map((s) => (
          <SpaceChip
            key={s.id}
            name={s.name}
            color={s.color}
            suggested={s.id === suggestedId && s.id !== selectedId}
            selected={s.id === selectedId}
            onClick={() => onPick(s.id === selectedId ? null : s.id)}
          />
        ))}
        {!adding && <Chip label="+ New" onClick={() => setAdding(true)} aria-label="New Space" />}
      </div>
      {adding && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="sr-only" htmlFor="new-space">
            New Space name
          </label>
          <input
            id="new-space"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Marketing, Food, Q4 campaign…"
            maxLength={40}
            className="h-12 min-w-0 flex-1 rounded-card bg-raised px-4 text-input text-fg outline-none placeholder:text-fg-subtle focus:ring-2 focus:ring-fg"
          />
          <button
            type="submit"
            aria-label="Create Space"
            disabled={!name.trim() || busy}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card bg-fg text-background disabled:opacity-40"
          >
            {busy ? <Plus size={24} strokeWidth={2} aria-hidden className="animate-pulse" /> : <Check size={24} strokeWidth={2} aria-hidden />}
          </button>
        </form>
      )}
    </div>
  );
}
