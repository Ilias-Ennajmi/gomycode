"use client";

import { useMemo, type CSSProperties } from "react";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { richTextToHtml } from "@/lib/engine/model/rich-text-html";
import type { CanvasObject } from "@/lib/engine/model/types";

/** Sanitised rich text of an object's content fragment (see richTextToHtml: everything is escaped). */
export function RichContent({
  doc,
  obj,
  className,
  style,
}: {
  doc: BoardDoc;
  obj: CanvasObject;
  className?: string;
  style?: CSSProperties;
}) {
  // `obj` is a fresh snapshot whenever the object or its content changes (BoardDoc drops the cache entry).
  const html = useMemo(() => {
    const frag = doc.content(obj.id);
    return frag ? richTextToHtml(frag) : "";
  }, [doc, obj]);
  return <div className={`atelier-rich ${className ?? ""}`} style={style} dangerouslySetInnerHTML={{ __html: html }} />;
}
