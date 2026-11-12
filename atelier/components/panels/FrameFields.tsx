"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { oneStepOn } from "@/lib/engine/model/one-step";
import type { FrameObj } from "@/lib/engine/model/types";

/** The most a frame's presenter notes may hold. */
export const FRAME_NOTES_MAX = 2000;
const NAME_MAX = 120;

const fieldClass =
  "w-full rounded-sm border border-line bg-canvas px-2 py-1.5 text-(length:--text-sm) text-fg outline-none placeholder:text-fg-muted focus-visible:border-select disabled:opacity-60";

/**
 * What a frame is as a slide, in the Inspector: its name and its presenter notes. Both are saved when the field loses
 * focus (the name also on Enter), as one undo step each; while a field is not being edited it follows the document, so
 * a change from another device shows up.
 */
export function FrameFields({ obj, doc, disabled }: { obj: FrameObj; doc: BoardDoc; disabled: boolean }) {
  const nameId = useId();
  const notesId = useId();
  const countId = useId();
  const [name, setName] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const latest = useRef({ name, notes, obj });
  useEffect(() => {
    latest.current = { name, notes, obj };
  });

  const saveName = () => {
    const draft = latest.current.name;
    if (draft === null) return;
    setName(null);
    const next = draft.trim();
    if (next && next !== obj.name) oneStepOn(doc, () => doc.update(obj.id, { name: next } as Partial<FrameObj>));
  };
  const saveNotes = () => {
    const draft = latest.current.notes;
    if (draft === null) return;
    setNotes(null);
    if (draft !== obj.notes) oneStepOn(doc, () => doc.update(obj.id, { notes: draft } as Partial<FrameObj>));
  };

  // Selecting something else while a field is being edited keeps what was typed.
  useEffect(
    () => () => {
      const { name: n, notes: t, obj: o } = latest.current;
      const trimmed = n?.trim();
      if (trimmed && trimmed !== o.name) oneStepOn(doc, () => doc.update(o.id, { name: trimmed } as Partial<FrameObj>));
      if (t !== null && t !== o.notes) oneStepOn(doc, () => doc.update(o.id, { notes: t } as Partial<FrameObj>));
    },
    [doc],
  );

  const shownNotes = notes ?? obj.notes;
  return (
    <>
      <p className="text-(length:--text-xs) font-medium text-fg-muted">Slide</p>
      <div className="grid gap-1">
        <label htmlFor={nameId} className="text-(length:--text-xs) text-fg-muted">
          Name
        </label>
        <input
          id={nameId}
          aria-label="Slide name"
          value={name ?? obj.name}
          maxLength={NAME_MAX}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              saveName();
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setName(null);
              latest.current = { ...latest.current, name: null };
              e.currentTarget.blur();
            }
          }}
          className={fieldClass}
        />
      </div>
      <div className="grid gap-1">
        <label htmlFor={notesId} className="text-(length:--text-xs) text-fg-muted">
          Presenter notes
        </label>
        <textarea
          id={notesId}
          aria-label="Presenter notes"
          aria-describedby={countId}
          value={shownNotes}
          maxLength={FRAME_NOTES_MAX}
          rows={5}
          disabled={disabled}
          onChange={(e) => setNotes(e.target.value.slice(0, FRAME_NOTES_MAX))}
          onBlur={saveNotes}
          className={`${fieldClass} resize-y`}
        />
        <p id={countId} className="flex justify-between text-(length:--text-xs) text-fg-muted">
          <span>Only you see these, while presenting. Never shared.</span>
          <span className="tabular-nums">
            {shownNotes.length} / {FRAME_NOTES_MAX}
          </span>
        </p>
      </div>
    </>
  );
}
