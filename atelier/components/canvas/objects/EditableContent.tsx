"use client";

import type { CSSProperties } from "react";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import type { CanvasObject } from "@/lib/engine/model/types";
import { useEditingDone, useEditingStart, useIsEditing } from "../editing-context";
import { RichTextEditor } from "../RichTextEditor";
import { RichContent } from "./RichContent";

/**
 * An object's rich text: the sanitised HTML normally, the Tiptap editor while the object is being edited. Both are
 * laid out with the same `style` and `padding`, so opening the editor does not move a single glyph.
 */
export function EditableContent({
  doc,
  obj,
  style,
  padding,
}: {
  doc: BoardDoc;
  obj: CanvasObject;
  style?: CSSProperties;
  padding?: string;
}) {
  const editing = useIsEditing(obj.id);
  const done = useEditingDone();
  const start = useEditingStart();
  if (!editing) return <RichContent doc={doc} obj={obj} style={padding ? { ...style, padding } : style} />;
  return (
    <RichTextEditor
      key={obj.id}
      doc={doc}
      objectId={obj.id}
      onDone={done}
      initialText={start.initialText}
      selectAll={start.selectAll}
      padding={padding}
      style={style}
    />
  );
}
