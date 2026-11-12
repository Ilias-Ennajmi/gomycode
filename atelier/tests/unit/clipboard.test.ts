import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { ArrowObj, CanvasObject, NewObject, StickyObj } from "@/lib/engine/model/types";
import { serializeSelection, ATELIER_MARKER } from "@/lib/engine/clipboard/serialize";
import { createPasteState, insertPaste, parseClipboard, type PasteItem } from "@/lib/engine/clipboard/parse";
import { richContentToJSON, writeRichContent, type RichJSON } from "@/lib/engine/clipboard/rich";

function shape(over: Partial<NewObject> = {}): NewObject {
  return { ...defaultsFor("shape"), ...over } as NewObject;
}
function sticky(over: Partial<NewObject> = {}): NewObject {
  return { ...defaultsFor("sticky"), ...over } as NewObject;
}
function arrow(over: Partial<NewObject> = {}): NewObject {
  return { ...defaultsFor("arrow"), ...over } as NewObject;
}
function frame(over: Partial<NewObject> = {}): NewObject {
  return { ...defaultsFor("frame"), w: 400, h: 300, ...over } as NewObject;
}
function image(over: Partial<NewObject> = {}): NewObject {
  return { ...defaultsFor("image"), assetId: "asset-1", ...over } as NewObject;
}
function file(name: string, type: string, bytes = 4): File {
  return new File([new Uint8Array(bytes)], name, { type });
}
function roundTrip(src: BoardDoc, ids: string[]): PasteItem[] {
  const { html, text } = serializeSelection(src, ids);
  return parseClipboard({ html, text });
}
function atelierPayload(items: PasteItem[]) {
  const first = items[0];
  if (first?.kind !== "atelier") throw new Error("expected an atelier item");
  return first.payload;
}
function boundArrows(d: BoardDoc): ArrowObj[] {
  return d.all().filter((o): o is ArrowObj => o.type === "arrow");
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("serializeSelection", () => {
  it("writes an atelier:v1 comment plus a readable fallback", () => {
    const d = new BoardDoc();
    const s = d.create(sticky({ x: 10, y: 20 }));
    writeText(d, s, "Hello <b>world</b>");
    const img = d.create(image({ x: 300, y: 20 }));

    const { html, text } = serializeSelection(d, [s, img], { assetUrl: (id) => `https://img.example/a/${id}/w1024.webp` });

    expect(html).toContain(`<!-- ${ATELIER_MARKER} `);
    expect(html).toContain("<p>Hello &lt;b&gt;world&lt;/b&gt;</p>");
    expect(html).toContain('<img src="https://img.example/a/asset-1/w1024.webp"');
    expect(text).toContain("Hello <b>world</b>");
    // The payload decodes to the objects and the asset list.
    const payload = atelierPayload(parseClipboard({ html }));
    expect(payload.v).toBe(1);
    expect(payload.objects.map((o) => o.type).sort()).toEqual(["image", "sticky"]);
    expect(payload.assets).toEqual([{ id: "asset-1", url: "https://img.example/a/asset-1/w1024.webp", w: 320, h: 240 }]);
  });

  it("returns empty strings for an empty or unknown selection", () => {
    const d = new BoardDoc();
    expect(serializeSelection(d, [])).toEqual({ html: "", text: "" });
    expect(serializeSelection(d, ["nope"])).toEqual({ html: "", text: "" });
  });

  it("includes the children of a copied frame and keeps z-order", () => {
    const d = new BoardDoc();
    const f = d.create(frame({ x: 0, y: 0 }));
    const a = d.create(sticky({ parentId: f, x: 10, y: 10 }));
    const b = d.create(sticky({ parentId: f, x: 220, y: 10 }));
    const payload = atelierPayload(roundTrip(d, [f]));
    expect(payload.objects.map((o) => o.id)).toEqual([f, a, b]);
  });

  it("serialises rich text content as editor JSON with marks", () => {
    const d = new BoardDoc();
    const s = d.create(sticky());
    d.transact(() => writeRichContent(d.content(s)!, boldAndLink));
    const payload = atelierPayload(roundTrip(d, [s]));
    expect(payload.objects[0].content).toEqual(boldAndLink);
  });
});

const boldAndLink: RichJSON = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "plain " },
        { type: "text", text: "bold", marks: [{ type: "bold" }] },
        { type: "text", text: " link", marks: [{ type: "link", attrs: { href: "https://example.com" } }] },
      ],
    },
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Title" }] },
  ],
};

function writeText(d: BoardDoc, id: string, text: string) {
  d.transact(() =>
    writeRichContent(d.content(id)!, { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] }),
  );
}

describe("rich content helpers", () => {
  it("round-trips editor JSON through a Y.XmlFragment", () => {
    const ydoc = new Y.Doc();
    const frag = ydoc.getXmlFragment("c");
    writeRichContent(frag, boldAndLink);
    expect(richContentToJSON(frag)).toEqual(boldAndLink);
  });

  it("ignores malformed content instead of throwing", () => {
    const ydoc = new Y.Doc();
    const frag = ydoc.getXmlFragment("c");
    expect(() => writeRichContent(frag, { nope: true } as unknown as RichJSON)).not.toThrow();
    expect(() => writeRichContent(frag, null as unknown as RichJSON)).not.toThrow();
    expect(frag.length).toBe(0);
  });
});

describe("copy and paste round trip", () => {
  it("keeps an arrow's binding to a copied target", () => {
    const src = new BoardDoc();
    const a = src.create(shape({ x: 0, y: 0, w: 100, h: 100 }));
    const b = src.create(shape({ x: 300, y: 0, w: 100, h: 100 }));
    src.create(
      arrow({
        x: 100,
        y: 50,
        w: 200,
        h: 1,
        start: { kind: "bound", id: a, anchor: { x: 1, y: 0.5 } },
        end: { kind: "bound", id: b, anchor: { x: 0, y: 0.5 } },
      }),
    );
    const all = src.all().map((o) => o.id);

    const dest = new BoardDoc();
    const ids = insertPaste(dest, roundTrip(src, all), { x: 500, y: 500 });

    expect(ids).toHaveLength(3);
    expect(ids).not.toContain(a);
    const [arr] = boundArrows(dest);
    const newShapes = dest.all().filter((o) => o.type === "shape");
    expect(arr.start).toEqual({ kind: "bound", id: newShapes[0].id, anchor: { x: 1, y: 0.5 } });
    expect(arr.end).toEqual({ kind: "bound", id: newShapes[1].id, anchor: { x: 0, y: 0.5 } });
  });

  it("unbinds the end whose target was not copied, at the target's current position", () => {
    const src = new BoardDoc();
    const a = src.create(shape({ x: 0, y: 0, w: 100, h: 100 }));
    const b = src.create(shape({ x: 300, y: 0, w: 100, h: 100 }));
    const arr = src.create(
      arrow({
        x: 100,
        y: 50,
        w: 200,
        h: 1,
        start: { kind: "bound", id: a, anchor: { x: 1, y: 0.5 } },
        end: { kind: "bound", id: b, anchor: { x: 0, y: 0.5 } },
      }),
    );

    const dest = new BoardDoc();
    insertPaste(dest, roundTrip(src, [a, arr]), { x: 0, y: 0 });

    const [pasted] = boundArrows(dest);
    const target = dest.all().find((o) => o.type === "shape")!;
    expect(pasted.start).toMatchObject({ kind: "bound", id: target.id });
    expect(pasted.end.kind).toBe("point");
    // B sat at x 300 on the source board; the whole paste moved by the same delta as the copied shape.
    const dx = target.x - 0;
    const dy = target.y - 0;
    expect(pasted.end).toEqual({ kind: "point", x: 300 + dx, y: 50 + dy });
  });

  it("never leaves an arrow bound to something that is not in the pasted set", () => {
    const src = new BoardDoc();
    const a = src.create(shape());
    const arr = src.create(arrow({ start: { kind: "bound", id: a, anchor: { x: 0.5, y: 0.5 } } }));
    const payload = atelierPayload(roundTrip(src, [arr]));
    const dest = new BoardDoc();
    insertPaste(dest, [{ kind: "atelier", payload }], { x: 0, y: 0 });
    expect(boundArrows(dest)[0].start.kind).toBe("point");
  });

  it("copies rich text content and remaps frame children", () => {
    const src = new BoardDoc();
    const f = src.create(frame({ x: 100, y: 100 }));
    const s = src.create(sticky({ parentId: f, x: 120, y: 120 }));
    src.transact(() => writeRichContent(src.content(s)!, boldAndLink));

    const dest = new BoardDoc();
    const ids = insertPaste(dest, roundTrip(src, [f]), { x: 0, y: 0 });

    const pf = dest.all().find((o) => o.type === "frame")!;
    const ps = dest.all().find((o): o is StickyObj => o.type === "sticky")!;
    expect(ids).toHaveLength(2);
    expect(ps.parentId).toBe(pf.id);
    expect(ps.id).not.toBe(s);
    expect(richContentToJSON(dest.content(ps.id)!)).toEqual(boldAndLink);
  });

  it("detaches a child whose frame was not copied", () => {
    const src = new BoardDoc();
    const f = src.create(frame());
    const s = src.create(sticky({ parentId: f }));
    const dest = new BoardDoc();
    insertPaste(dest, roundTrip(src, [s]), { x: 0, y: 0 });
    expect(dest.all()[0].parentId).toBeNull();
  });

  it("centres the pasted objects on the paste point", () => {
    const src = new BoardDoc();
    const a = src.create(shape({ x: 10, y: 10, w: 100, h: 100 }));
    const b = src.create(shape({ x: 210, y: 10, w: 100, h: 100 }));
    const dest = new BoardDoc();
    insertPaste(dest, roundTrip(src, [a, b]), { x: 1000, y: 1000 });
    const xs = dest.all().map((o) => o.x);
    const ys = dest.all().map((o) => o.y);
    // union is 300 x 100: centre (1000, 1000) means x from 850 and y from 950
    expect(Math.min(...xs)).toBe(850);
    expect(Math.max(...xs)).toBe(1050);
    expect(Math.min(...ys)).toBe(950);
  });

  it("offsets by 16 px each time the same place is pasted again", () => {
    const src = new BoardDoc();
    const a = src.create(shape({ x: 0, y: 0, w: 100, h: 100 }));
    const items = roundTrip(src, [a]);
    const dest = new BoardDoc();
    const state = createPasteState();
    insertPaste(dest, items, { x: 200, y: 200 }, { state });
    insertPaste(dest, items, { x: 200, y: 200 }, { state });
    insertPaste(dest, items, { x: 200, y: 200 }, { state });
    insertPaste(dest, items, { x: 900, y: 900 }, { state }); // moved: back to no offset
    const xs = dest.all().map((o) => o.x);
    expect(xs).toEqual([150, 166, 182, 850]);
    expect(dest.all().map((o) => o.y)).toEqual([150, 166, 182, 850]);
  });

  it("pastes as one undo step", () => {
    const src = new BoardDoc();
    const ids = [src.create(shape()), src.create(shape({ x: 300 }))];
    const dest = new BoardDoc();
    insertPaste(dest, roundTrip(src, ids), { x: 0, y: 0 });
    expect(dest.all()).toHaveLength(2);
    dest.undo();
    expect(dest.all()).toHaveLength(0);
  });

  it("skips objects that fail validation but still pastes the rest", () => {
    const src = new BoardDoc();
    const a = src.create(shape());
    const payload = atelierPayload(roundTrip(src, [a]));
    payload.objects.push({ id: "bad", type: "shape", x: Number.NaN } as never, { id: "alien", type: "hologram" } as never);
    const dest = new BoardDoc();
    expect(insertPaste(dest, [{ kind: "atelier", payload }], { x: 0, y: 0 })).toHaveLength(1);
  });
});

describe("parseClipboard", () => {
  it("falls back to a text item when the payload is not base64", () => {
    const html = `<!-- ${ATELIER_MARKER} !!!not base64!!! --><p>fallback</p>`;
    expect(parseClipboard({ html, text: "fallback" })).toEqual([{ kind: "text", text: "fallback", lines: 1 }]);
  });

  it("falls back to a text item when the payload is not JSON", () => {
    const html = `<!-- ${ATELIER_MARKER} ${btoa("this is {not json")} --><p>x</p>`;
    expect(parseClipboard({ html, text: "plain" })).toEqual([{ kind: "text", text: "plain", lines: 1 }]);
  });

  it("falls back to a text item when the payload has the wrong shape or version", () => {
    for (const bad of [{ v: 2, objects: [], assets: [] }, { v: 1, objects: "no" }, [1, 2], null, "str"]) {
      const html = `<!-- ${ATELIER_MARKER} ${btoa(JSON.stringify(bad))} -->`;
      expect(parseClipboard({ html, text: "kept" })).toEqual([{ kind: "text", text: "kept", lines: 1 }]);
    }
  });

  it("derives text from the html when there is no plain text and the payload is malformed", () => {
    const html = `<!-- ${ATELIER_MARKER} @@@@ --><p>Hello &amp; goodbye</p><p>second</p>`;
    const items = parseClipboard({ html });
    expect(items).toEqual([{ kind: "text", text: "Hello & goodbye\nsecond", lines: 2 }]);
  });

  it("never throws on odd input and returns nothing for an empty clipboard", () => {
    expect(parseClipboard({})).toEqual([]);
    expect(parseClipboard({ text: "", html: "", files: [] })).toEqual([]);
    expect(parseClipboard({ text: "  \n \n" })).toEqual([]);
    expect(() => parseClipboard({ html: `<!-- ${ATELIER_MARKER} ${"A".repeat(10_000)} -->` })).not.toThrow();
  });

  it("counts 500 lines", () => {
    const text = Array.from({ length: 500 }, (_, i) => `line ${i}`).join("\n");
    const [item] = parseClipboard({ text });
    expect(item).toMatchObject({ kind: "text", lines: 500 });
  });

  it("does not count a trailing newline or treat CRLF as two lines", () => {
    expect(parseClipboard({ text: "a\r\nb\r\n" })).toEqual([{ kind: "text", text: "a\nb", lines: 2 }]);
  });

  it("produces image items in order, ignoring non-images", () => {
    const files = [file("a.png", "image/png"), file("notes.pdf", "application/pdf"), file("b.jpg", "image/jpeg"), file("c.heic", "image/heic")];
    const items = parseClipboard({ files });
    expect(items.map((i) => (i.kind === "image" ? i.file.name : i.kind))).toEqual(["a.png", "b.jpg", "c.heic"]);
  });

  it("recognises an image by extension when the browser gives no type", () => {
    const items = parseClipboard({ files: [file("shot.webp", "")] });
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("image");
  });

  it("prefers files over text when both are present", () => {
    const items = parseClipboard({ files: [file("a.png", "image/png")], text: "alt text" });
    expect(items.map((i) => i.kind)).toEqual(["image"]);
  });

  it("detects http and https URLs only", () => {
    expect(parseClipboard({ text: "https://example.com/a?b=1" })).toEqual([{ kind: "url", url: "https://example.com/a?b=1" }]);
    expect(parseClipboard({ text: "  http://example.com  \n" })).toEqual([{ kind: "url", url: "http://example.com" }]);
    for (const t of ["javascript:alert(1)", "ftp://example.com", "data:text/html,hi", "mailto:a@b.c", "example.com", "see https://example.com now"]) {
      const [item] = parseClipboard({ text: t });
      expect(item.kind).toBe("text");
    }
  });
});

describe("insertPaste: text, urls and images", () => {
  it("creates a text object with one paragraph per line", () => {
    const d = new BoardDoc();
    const [id] = insertPaste(d, [{ kind: "text", text: "one\n\nthree", lines: 3 }], { x: 100, y: 100 });
    const o = d.get(id)!;
    expect(o.type).toBe("text");
    expect(richContentToJSON(d.content(id)!).content?.map((p) => p.content?.[0]?.text ?? "")).toEqual(["one", "", "three"]);
    // centred on the paste point
    expect(o.x + o.w / 2).toBeCloseTo(100);
    expect(o.y + o.h / 2).toBeCloseTo(100);
  });

  it("creates a text object with a link mark for a URL pasted as text", () => {
    const d = new BoardDoc();
    const [id] = insertPaste(d, [{ kind: "url", url: "https://example.com/x" }], { x: 0, y: 0 }, { urlAsText: true });
    expect(richContentToJSON(d.content(id)!).content![0].content![0]).toEqual({
      type: "text",
      text: "https://example.com/x",
      marks: [{ type: "link", attrs: { href: "https://example.com/x" } }],
    });
  });

  it("hands images to the uploader in a grid, six per row with a 16 px gutter", () => {
    const d = new BoardDoc();
    const calls: { name: string; at: { x: number; y: number } }[] = [];
    const items: PasteItem[] = Array.from({ length: 8 }, (_, i) => ({ kind: "image" as const, file: file(`i${i}.png`, "image/png") }));
    const created = insertPaste(d, items, { x: 0, y: 0 }, { addImage: (f, at) => (calls.push({ name: f.name, at }), `obj-${f.name}`) });

    expect(calls.map((c) => c.name)).toEqual(items.map((i) => (i.kind === "image" ? i.file.name : "")));
    expect(created).toEqual(calls.map((c) => `obj-${c.name}`));
    const pitch = 320 + 16;
    // first row: 6 images, second row: 2 images, identical x for column 0
    expect(calls[1].at.x - calls[0].at.x).toBe(pitch);
    expect(calls[5].at.y).toBe(calls[0].at.y);
    expect(calls[6].at.y - calls[0].at.y).toBe(pitch);
    expect(calls[6].at.x).toBe(calls[0].at.x);
    // the grid is centred on the paste point
    const cx = (calls[0].at.x + calls[5].at.x) / 2;
    expect(cx).toBeCloseTo(0);
  });

  it("reports a failing image without throwing and ignores images when no uploader is given", async () => {
    const d = new BoardDoc();
    const items: PasteItem[] = [{ kind: "image", file: file("x.png", "image/png") }];
    expect(insertPaste(d, items, { x: 0, y: 0 })).toEqual([]);

    const onImageError = vi.fn();
    insertPaste(d, items, { x: 0, y: 0 }, { addImage: () => Promise.reject(new Error("nope")), onImageError });
    await new Promise((r) => setTimeout(r, 0));
    expect(onImageError).toHaveBeenCalledTimes(1);
    expect(onImageError.mock.calls[0][0].name).toBe("x.png");
  });

  it("returns no ids and changes nothing for an empty item list", () => {
    const d = new BoardDoc();
    expect(insertPaste(d, [], { x: 0, y: 0 })).toEqual([]);
    expect(d.all()).toHaveLength(0);
  });
});

describe("types", () => {
  it("accepts any canvas object in a payload", () => {
    const o: CanvasObject | undefined = undefined;
    expect(o).toBeUndefined();
  });
});
