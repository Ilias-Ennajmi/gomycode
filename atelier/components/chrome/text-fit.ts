import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { richTextToHtml } from "@/lib/engine/model/rich-text-html";
import { measureTextBox } from "@/lib/engine/model/text-measure";
import type { TextObj } from "@/lib/engine/model/types";

/**
 * A text box's size after its font size or line spacing changed from the formatting bar: the editor resizes boxes only
 * while typing, so a change made on a selected (not edited) text has to measure the text itself. Auto-width boxes keep
 * growing sideways, fixed-width boxes keep their width and grow downwards.
 */
export function refitText(doc: BoardDoc, o: TextObj, over: Partial<Pick<TextObj, "fontSize" | "lineHeight">>): Partial<TextObj> {
  const frag = doc.content(o.id);
  if (!frag) return over;
  const box = measureTextBox(richTextToHtml(frag), {
    fontSize: over.fontSize ?? o.fontSize,
    lineHeight: over.lineHeight ?? o.lineHeight,
    width: o.autoWidth ? undefined : o.w,
  });
  if (!(box.w > 0 && box.h > 0)) return over;
  return { ...over, w: o.autoWidth ? Math.max(Math.ceil(box.w) + 2, 16) : o.w, h: Math.ceil(box.h) };
}
