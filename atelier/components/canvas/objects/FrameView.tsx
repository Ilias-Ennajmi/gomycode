"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import type { FrameObj } from "@/lib/engine/model/types";
import { useEditingDone, useIsEditing } from "../editing-context";
import { safeColor } from "./style";

export const DEFAULT_FRAME_NAME = "Frame";

/** The frame's name as an input above its corner: Enter or leaving it saves, Escape keeps the old name. */
function NameField({ doc, obj }: { doc: BoardDoc; obj: FrameObj }) {
  const input = useRef<HTMLInputElement>(null);
  const done = useEditingDone();
  const cancelled = useRef(false);
  const saved = useRef(false);

  const save = () => {
    if (cancelled.current || saved.current) return;
    saved.current = true;
    const name = (input.current?.value ?? obj.name).trim() || DEFAULT_FRAME_NAME;
    if (name !== obj.name) doc.update(obj.id, { name });
  };

  useEffect(() => {
    const el = input.current;
    el?.focus();
    el?.select();
    // Editing can be ended from outside (a press on the canvas): keep what was typed.
    return () => {
      if (!saved.current) save();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <input
      ref={input}
      data-editing-surface=""
      aria-label="Frame name"
      defaultValue={obj.name}
      maxLength={120}
      spellCheck={false}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          save();
          done();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelled.current = true;
          done();
        }
      }}
      onBlur={save}
      style={{
        pointerEvents: "auto",
        userSelect: "text",
        width: "max(120px, 100%)",
        padding: 0,
        margin: 0,
        border: 0,
        outline: "1px solid var(--color-selection)",
        outlineOffset: 2,
        background: "var(--color-surface)",
        color: "var(--color-ink)",
        font: "inherit",
      }}
    />
  );
}

/**
 * A frame hosts its children inside a clip box. Children keep their absolute canvas coordinates: the inner layer
 * applies the inverse of the frame's own transform, so rotating or moving the frame needs no coordinate changes here.
 * The name label sits outside the clip at constant screen size (scaled by the layer's --inv-zoom variable).
 */
export function FrameView({ doc, obj, children }: { doc: BoardDoc; obj: FrameObj; children?: ReactNode }) {
  const editing = useIsEditing(obj.id);
  const cx = obj.x + obj.w / 2;
  const cy = obj.y + obj.h / 2;
  const inverse =
    obj.rotation === 0
      ? `translate(${-obj.x}px, ${-obj.y}px)`
      : `translate(${obj.w / 2}px, ${obj.h / 2}px) rotate(${-obj.rotation}rad) translate(${-cx}px, ${-cy}px)`;
  return (
    <>
      <div
        data-frame-label=""
        style={{
          position: "absolute",
          left: 0,
          bottom: "100%",
          maxWidth: editing ? undefined : `max(80px, calc(${obj.w}px * var(--zoom, 1)))`,
          paddingBottom: "var(--space-1)",
          transformOrigin: "0 100%",
          transform: "scale(var(--inv-zoom, 1))",
          color: "var(--color-muted)",
          fontSize: "var(--text-xs)",
          lineHeight: 1.2,
          whiteSpace: "nowrap",
          overflow: editing ? "visible" : "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {editing ? <NameField doc={doc} obj={obj} /> : obj.name}
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          overflow: obj.clip ? "hidden" : "visible",
          background: safeColor(obj.background, "var(--color-surface)"),
          boxShadow: "var(--elev-1)",
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: inverse }}>{children}</div>
      </div>
    </>
  );
}
