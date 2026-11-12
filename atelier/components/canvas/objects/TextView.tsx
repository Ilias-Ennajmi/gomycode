"use client";

import { useMemo } from "react";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { richTextToPlainLines } from "@/lib/engine/model/rich-text-html";
import type { TextObj } from "@/lib/engine/model/types";
import { TEXT_BARS_ZOOM, useLod } from "../lod";
import { RichContent } from "./RichContent";
import { safeColor } from "./style";

export type TextLod = "full" | "bars";

export function textLodFor(zoom: number): TextLod {
  return zoom < TEXT_BARS_ZOOM ? "bars" : "full";
}

/** Grey bars standing in for lines of text when zoomed far out; width follows the line length. */
function TextBars({ doc, obj }: { doc: BoardDoc; obj: TextObj }) {
  const lines = useMemo(() => {
    const frag = doc.content(obj.id);
    const raw = frag ? richTextToPlainLines(frag) : [];
    return (raw.length ? raw : [""]).slice(0, 40);
  }, [doc, obj]);
  const lineH = obj.fontSize * obj.lineHeight;
  const barH = obj.fontSize * 0.55;
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0 }}>
      {lines.map((text, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: 0,
            top: i * lineH + (lineH - barH) / 2,
            height: barH,
            width: Math.min(obj.w, Math.max(text.length, 3) * obj.fontSize * 0.5),
            background: "var(--color-muted)",
            opacity: 0.35,
            borderRadius: barH / 2,
          }}
        />
      ))}
    </div>
  );
}

export function TextView({ doc, obj, lod }: { doc: BoardDoc; obj: TextObj; lod?: TextLod }) {
  const ctx = useLod();
  const level = lod ?? textLodFor(ctx.zoom);
  if (level === "bars") return <TextBars doc={doc} obj={obj} />;
  return (
    <RichContent
      doc={doc}
      obj={obj}
      style={{
        width: obj.w,
        minHeight: obj.h,
        color: safeColor(obj.color, "var(--color-ink)"),
        fontSize: obj.fontSize,
        lineHeight: obj.lineHeight,
        textAlign: obj.align,
        whiteSpace: obj.autoWidth ? "pre" : "pre-wrap",
        overflowWrap: obj.autoWidth ? "normal" : "break-word",
      }}
    />
  );
}
