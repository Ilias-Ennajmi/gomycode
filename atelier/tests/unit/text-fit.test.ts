import { describe, expect, it } from "vitest";
import { refitText } from "@/components/chrome/text-fit";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { writeRichContent } from "@/lib/engine/clipboard/rich";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject, TextObj } from "@/lib/engine/model/types";

function textDoc(extra: Partial<TextObj> = {}) {
  const doc = new BoardDoc();
  const id = doc.create({ ...defaultsFor("text"), ...extra } as NewObject);
  writeRichContent(doc.content(id)!, { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello brand world" }] }] });
  return { doc, id, obj: () => doc.get(id) as TextObj };
}

describe("refitText", () => {
  it("an auto-width box grows both ways with a bigger font", () => {
    const { doc, obj } = textDoc();
    const before = refitText(doc, obj(), {});
    const bigger = refitText(doc, obj(), { fontSize: 48 });
    expect(bigger.fontSize).toBe(48);
    expect(bigger.w!).toBeGreaterThan(before.w!);
    expect(bigger.h!).toBeGreaterThan(before.h!);
  });

  it("a fixed-width box keeps its width and grows downwards", () => {
    const { doc, obj } = textDoc({ autoWidth: false, w: 120 });
    const small = refitText(doc, obj(), { fontSize: 16 });
    const big = refitText(doc, obj(), { fontSize: 48 });
    expect(big.w).toBe(120);
    expect(big.h!).toBeGreaterThan(small.h!);
  });

  it("looser line spacing makes a taller box", () => {
    const { doc, obj } = textDoc({ autoWidth: false, w: 120 });
    expect(refitText(doc, obj(), { lineHeight: 2 }).h!).toBeGreaterThan(refitText(doc, obj(), { lineHeight: 1 }).h!);
  });

  it("a text without content leaves the patch alone", () => {
    const doc = new BoardDoc();
    const id = doc.create({ ...defaultsFor("text") } as NewObject);
    doc.remove([id]);
    expect(refitText(doc, { ...defaultsFor("text"), id } as TextObj, { fontSize: 30 })).toEqual({ fontSize: 30 });
  });
});
