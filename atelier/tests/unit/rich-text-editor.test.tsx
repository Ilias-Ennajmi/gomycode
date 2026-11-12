import { act, render, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { RichTextEditor } from "@/components/canvas/RichTextEditor";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import { normalizeLinkHref } from "@/lib/engine/model/links";
import { richTextToHtml, richTextToPlainLines } from "@/lib/engine/model/rich-text-html";
import type { NewObject, StickyObj, TextObj } from "@/lib/engine/model/types";

// jsdom has no layout; ProseMirror asks for rects when it scrolls the caret into view.
beforeEach(() => {
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) };
  Range.prototype.getBoundingClientRect = () => rect as DOMRect;
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
  Element.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
});
afterEach(() => vi.restoreAllMocks());

type Mounted = { doc: BoardDoc; id: string; editor: Editor; frag: Y.XmlFragment; unmount: () => void; onDone: ReturnType<typeof vi.fn> };

async function mount(kind: "sticky" | "text" | "shape" = "sticky", extra: Partial<NewObject> = {}, doc = new BoardDoc(), existing?: string): Promise<Mounted> {
  const id = existing ?? doc.create({ ...defaultsFor(kind), x: 0, y: 0, ...extra } as NewObject);
  doc.undoManager.clear();
  let editor: Editor | null = null;
  const onDone = vi.fn();
  const utils = render(<RichTextEditor doc={doc} objectId={id} onDone={onDone} onEditor={(e) => (editor = e)} />);
  await waitFor(() => expect(editor).not.toBeNull());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10)); // the sync plugin renders the fragment on the next tick
  });
  return { doc, id, editor: editor!, frag: doc.content(id)!, unmount: utils.unmount, onDone };
}

/** Unmount and let Tiptap destroy the editor (it does so a moment after the component is gone). */
const close = async (m: Mounted) => {
  m.unmount();
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
};

const typeInto = async (m: Mounted, text: string) => {
  await act(async () => {
    m.editor.chain().focus("end").insertContent(text).run();
  });
};

const key = (m: Mounted, init: KeyboardEventInit) => {
  const ev = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  act(() => {
    m.editor.view.dom.dispatchEvent(ev);
  });
  return ev;
};

describe("RichTextEditor: bound to the object's content", () => {
  it("typing updates the Y.XmlFragment", async () => {
    const m = await mount();
    await typeInto(m, "Hello world");
    expect(richTextToPlainLines(m.frag)).toEqual(["Hello world"]);
  });

  it("shows what is already in the fragment", async () => {
    const doc = new BoardDoc();
    const id = doc.create({ ...defaultsFor("sticky") } as NewObject);
    const frag = doc.content(id)!;
    const p = new Y.XmlElement("paragraph");
    const t = new Y.XmlText();
    t.insert(0, "Existing");
    p.insert(0, [t]);
    frag.insert(0, [p]);
    const m = await mount("sticky", {}, doc, id);
    expect(m.editor.getText()).toBe("Existing");
  });

  it("changes made elsewhere (a remote peer) show up in the editor", async () => {
    const m = await mount();
    await typeInto(m, "mine");
    const other = new Y.Doc();
    Y.applyUpdate(other, Y.encodeStateAsUpdate(m.doc.ydoc));
    other.transact(() => {
      const root = other.getMap("objects").get(m.id) as Y.Map<unknown>;
      const frag = root.get("content") as Y.XmlFragment;
      const p = new Y.XmlElement("paragraph");
      const t = new Y.XmlText();
      t.insert(0, "theirs");
      p.insert(0, [t]);
      frag.insert(frag.length, [p]);
    });
    await act(async () => {
      Y.applyUpdate(m.doc.ydoc, Y.encodeStateAsUpdate(other, Y.encodeStateVector(m.doc.ydoc)), "remote");
    });
    expect(m.editor.getText()).toContain("theirs");
  });
});

describe("RichTextEditor: formatting", () => {
  it("Mod+B toggles bold in the fragment", async () => {
    const m = await mount();
    await typeInto(m, "bold me");
    await act(async () => {
      m.editor.commands.selectAll();
    });
    key(m, { key: "b", ctrlKey: true });
    expect(richTextToHtml(m.frag)).toContain("<strong>bold me</strong>");
    key(m, { key: "b", ctrlKey: true });
    expect(richTextToHtml(m.frag)).not.toContain("<strong>");
  });

  it("Mod+I and Mod+U toggle italic and underline", async () => {
    const m = await mount();
    await typeInto(m, "text");
    await act(async () => {
      m.editor.commands.selectAll();
    });
    key(m, { key: "i", ctrlKey: true });
    key(m, { key: "u", ctrlKey: true });
    const html = richTextToHtml(m.frag);
    expect(html).toContain("<em>");
    expect(html).toContain("<u>");
  });

  it("headings, lists, strike, alignment and mixed font sizes are written to the fragment", async () => {
    const m = await mount();
    await typeInto(m, "Title");
    await act(async () => {
      m.editor.chain().selectAll().toggleHeading({ level: 2 }).setTextAlign("center").run();
    });
    expect(richTextToHtml(m.frag)).toContain('<h2 style="text-align:center">Title</h2>');
    await act(async () => {
      m.editor.chain().focus("end").insertContent("<p>item</p>").selectAll().setFontSize("32px").run();
    });
    expect(richTextToHtml(m.frag)).toContain("font-size:32px");
    await act(async () => {
      m.editor.chain().focus("end").toggleBulletList().toggleStrike().run();
    });
    const html = richTextToHtml(m.frag);
    expect(html).toContain("<ul>");
  });

  it("has a lineHeight paragraph attribute", async () => {
    const m = await mount();
    await typeInto(m, "spaced");
    await act(async () => {
      m.editor.chain().selectAll().setParagraphLineHeight(1.8).run();
    });
    expect(richTextToHtml(m.frag)).toContain("line-height:1.8");
    await act(async () => {
      m.editor.chain().selectAll().unsetParagraphLineHeight().run();
    });
    expect(richTextToHtml(m.frag)).not.toContain("line-height");
  });

  it("only http(s) and mailto links are accepted", async () => {
    const m = await mount();
    await typeInto(m, "click");
    await act(async () => {
      m.editor.commands.selectAll();
    });
    let ok = true;
    await act(async () => {
      ok = m.editor.commands.setLink({ href: "javascript:alert(1)" });
    });
    expect(ok).toBe(false);
    expect(richTextToHtml(m.frag)).not.toContain("<a");
    await act(async () => {
      m.editor.commands.setLink({ href: "data:text/html,<script>1</script>" });
    });
    expect(richTextToHtml(m.frag)).not.toContain("<a");
    await act(async () => {
      m.editor.commands.setLink({ href: "https://example.com/x" });
    });
    expect(richTextToHtml(m.frag)).toContain('<a href="https://example.com/x" target="_blank" rel="noopener noreferrer">click</a>');
    await act(async () => {
      m.editor.commands.setLink({ href: "mailto:a@b.co" });
    });
    expect(richTextToHtml(m.frag)).toContain('href="mailto:a@b.co"');
  });

  it("links carry rel=noopener noreferrer in the editor too", async () => {
    const m = await mount();
    await typeInto(m, "click");
    await act(async () => {
      m.editor.chain().selectAll().setLink({ href: "https://example.com" }).run();
    });
    const a = m.editor.view.dom.querySelector("a");
    expect(a?.getAttribute("rel")).toBe("noopener noreferrer");
  });
});

describe("normalizeLinkHref", () => {
  it("accepts http(s) and mailto, adds https:// to bare hosts, rejects everything else", () => {
    expect(normalizeLinkHref("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(normalizeLinkHref("  http://example.com  ")).toBe("http://example.com");
    expect(normalizeLinkHref("example.com/path")).toBe("https://example.com/path");
    expect(normalizeLinkHref("mailto:me@example.com")).toBe("mailto:me@example.com");
    expect(normalizeLinkHref("me@example.com")).toBe("mailto:me@example.com");
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", " java\nscript:alert(1)", "data:text/html,x", "vbscript:x", "file:///etc/passwd", "", "   ", "//evil.com", "https://"]) {
      expect(normalizeLinkHref(bad)).toBeNull();
    }
  });
});

describe("RichTextEditor: undo goes through the board's undo manager", () => {
  it("Cmd/Ctrl+Z inside the editor undoes typed text, and Shift+Z redoes it", async () => {
    const m = await mount();
    await typeInto(m, "Typed text");
    expect(m.doc.canUndo()).toBe(true);
    const ev = key(m, { key: "z", ctrlKey: true });
    expect(ev.defaultPrevented).toBe(true);
    expect(richTextToPlainLines(m.frag)).toEqual([]);
    expect(m.editor.getText()).toBe("");
    key(m, { key: "z", ctrlKey: true, shiftKey: true });
    expect(richTextToPlainLines(m.frag)).toEqual(["Typed text"]);
  });

  it("the board's own doc.undo() also undoes typing (one stack for everything)", async () => {
    const m = await mount();
    await typeInto(m, "abc");
    m.doc.undo();
    expect(richTextToPlainLines(m.frag)).toEqual([]);
  });

  it("remote edits are not undone, only the local typing is", async () => {
    const m = await mount();
    await typeInto(m, "mine");
    m.doc.stopCapturing();
    const other = new Y.Doc();
    Y.applyUpdate(other, Y.encodeStateAsUpdate(m.doc.ydoc));
    other.transact(() => {
      const frag = (other.getMap("objects").get(m.id) as Y.Map<unknown>).get("content") as Y.XmlFragment;
      const p = new Y.XmlElement("paragraph");
      const t = new Y.XmlText();
      t.insert(0, "theirs");
      p.insert(0, [t]);
      frag.insert(frag.length, [p]);
    });
    await act(async () => {
      Y.applyUpdate(m.doc.ydoc, Y.encodeStateAsUpdate(other, Y.encodeStateVector(m.doc.ydoc)), "remote");
    });
    expect(richTextToPlainLines(m.frag)).toEqual(["mine", "theirs"]);
    key(m, { key: "z", ctrlKey: true });
    expect(richTextToPlainLines(m.frag)).toEqual(["theirs"]);
    expect(m.doc.canUndo()).toBe(false);
  });

  it("typing and object edits interleave on one stack", async () => {
    const m = await mount();
    await typeInto(m, "text");
    m.doc.stopCapturing();
    m.doc.update(m.id, { x: 99 });
    m.doc.undo();
    expect(m.doc.get(m.id)!.x).toBe(0);
    expect(richTextToPlainLines(m.frag)).toEqual(["text"]);
    m.doc.undo();
    expect(richTextToPlainLines(m.frag)).toEqual([]);
  });

  it("closing the editor leaves the board's undo manager alive: edits keep being captured and typing stays undoable", async () => {
    const m = await mount();
    await typeInto(m, "kept");
    m.doc.stopCapturing();
    await close(m);
    m.doc.update(m.id, { x: 5 });
    expect(m.doc.canUndo()).toBe(true);
    m.doc.undo(); // the move
    expect(m.doc.get(m.id)!.x).toBe(0);
    expect(richTextToPlainLines(m.frag)).toEqual(["kept"]);
    m.doc.undo(); // the typing, after the editor is gone
    expect(richTextToPlainLines(m.frag)).toEqual([]);
    m.doc.redo();
    expect(richTextToPlainLines(m.frag)).toEqual(["kept"]);
  });

  it("a second editor on the same board works the same way", async () => {
    const m = await mount();
    await typeInto(m, "first");
    m.doc.stopCapturing();
    await close(m);
    const m2 = await mount("sticky", {}, m.doc, m.id);
    await typeInto(m2, " second");
    expect(richTextToPlainLines(m2.frag)).toEqual(["first second"]);
    key(m2, { key: "z", ctrlKey: true });
    expect(richTextToPlainLines(m2.frag)).toEqual(["first"]);
  });
});

describe("RichTextEditor: leaving", () => {
  it("Escape calls onDone", async () => {
    const m = await mount();
    const ev = key(m, { key: "Escape" });
    expect(ev.defaultPrevented).toBe(true);
    expect(m.onDone).toHaveBeenCalledTimes(1);
  });

  it("is a pointer surface of its own, marked so the canvas leaves its presses alone", async () => {
    const m = await mount();
    const surface = m.editor.view.dom.closest("[data-editing-surface]") as HTMLElement | null;
    expect(surface).not.toBeNull();
    expect(surface!.style.pointerEvents).toBe("auto");
  });
});

describe("RichTextEditor: growing", () => {
  const long = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ".repeat(3);

  it("a sticky grows vertically with its text and keeps its font size", async () => {
    const m = await mount("sticky");
    const before = m.doc.get(m.id) as StickyObj;
    await typeInto(m, long);
    const after = m.doc.get(m.id) as StickyObj;
    expect(after.h).toBeGreaterThan(before.h);
    expect(after.w).toBe(before.w);
    expect(after.size).toBe(before.size);
    expect(after.size).toBe("M");
  });

  it("a sticky does not grow while the text fits", async () => {
    const m = await mount("sticky");
    await typeInto(m, "short");
    expect((m.doc.get(m.id) as StickyObj).h).toBe(200);
  });

  it("growth is part of the typing's undo step", async () => {
    const m = await mount("sticky");
    await typeInto(m, long);
    expect((m.doc.get(m.id) as StickyObj).h).toBeGreaterThan(200);
    m.doc.undo();
    expect(richTextToPlainLines(m.frag)).toEqual([]);
    expect((m.doc.get(m.id) as StickyObj).h).toBe(200);
  });

  it("an auto-width text box follows its content in width and height", async () => {
    const m = await mount("text", { w: 16, h: 32 });
    await typeInto(m, "Hello");
    const a = m.doc.get(m.id) as TextObj;
    await typeInto(m, " and a lot more words on the same line");
    const b = m.doc.get(m.id) as TextObj;
    expect(b.w).toBeGreaterThan(a.w);
    expect(b.h).toBeCloseTo(a.h);
    expect(b.autoWidth).toBe(true);
  });

  it("a fixed-width text box wraps and grows in height only", async () => {
    const m = await mount("text", { w: 150, h: 32, autoWidth: false });
    await typeInto(m, long);
    const o = m.doc.get(m.id) as TextObj;
    expect(o.w).toBe(150);
    expect(o.h).toBeGreaterThan(60);
  });
});
