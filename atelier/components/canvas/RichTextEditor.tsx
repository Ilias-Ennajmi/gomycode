"use client";

import { Collaboration } from "@tiptap/extension-collaboration";
import TextAlign from "@tiptap/extension-text-align";
import { type Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ySyncPluginKey } from "@tiptap/y-tiptap";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { sharedUndoManager } from "@/lib/engine/doc/shared-undo";
import { normalizeLinkHref } from "@/lib/engine/model/links";
import { STICKY_FONT_PX, STICKY_LINE_HEIGHT, STICKY_PADDING_PX } from "@/lib/engine/model/defaults";
import { richTextToHtml } from "@/lib/engine/model/rich-text-html";
import { measureTextBox, measureTextHeight } from "@/lib/engine/model/text-measure";
import { ParagraphLineHeight, RangedFontSize, TextStyle, isAllowedLinkUri } from "./rich-text-extensions";

export type RichTextEditorProps = {
  doc: BoardDoc;
  /** The text, sticky or shape whose `content` fragment is edited. */
  objectId: string;
  /** Escape was pressed: the owner closes the editor. */
  onDone: () => void;
  /** Typed into the editor right after it opens (the key that started editing a selected sticky). */
  initialText?: string;
  /** Select the existing text when the editor opens; otherwise the caret goes to the end. */
  selectAll?: boolean;
  /** Padding inside the edited area, as CSS. It is part of the editable surface, so clicks in it keep the caret. */
  padding?: string;
  style?: CSSProperties;
  className?: string;
  /** Receives the Tiptap editor once it exists (and null when it is destroyed). Used by the formatting bar and tests. */
  onEditor?: (editor: Editor | null) => void;
};

/**
 * Edits an object's rich text in place. The editor is bound to the object's Y.XmlFragment through Tiptap's
 * Collaboration extension, so typing is a Yjs edit like any other: it syncs, persists, and undoes with the board.
 * Tiptap's own history is off; the sync plugin's origin is tracked by the board's undo manager (`trackOrigin`) and the
 * plugin is handed that manager (wrapped, so closing the editor cannot destroy it). Edits of other origins, such as a
 * peer's, are never undone. Mounted only while the object is being edited.
 */
export function RichTextEditor({
  doc,
  objectId,
  onDone,
  initialText = "",
  selectAll = false,
  padding,
  style,
  className,
  onEditor,
}: RichTextEditorProps) {
  const fragment = doc.content(objectId);
  const doneRef = useRef(onDone);
  const [linkOpen, setLinkOpen] = useState(false);
  const linkOpenRef = useRef(false);
  const edit = useRef<(() => void) | null>(null);

  useEffect(() => {
    doneRef.current = onDone;
  });
  useEffect(() => {
    linkOpenRef.current = linkOpen;
  }, [linkOpen]);

  // Typing is written under the sync plugin's origin; undo must see it. Idempotent, and kept for the board's lifetime:
  // steps already on the stack stay undoable after the editor is gone.
  useEffect(() => {
    doc.trackOrigin(ySyncPluginKey);
  }, [doc]);

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        undoRedo: false, // undo is the board's
        heading: { levels: [1, 2, 3] },
        // not part of what the canvas renders
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        dropcursor: false,
        gapcursor: false,
        trailingNode: false,
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          isAllowedUri: (url: string) => isAllowedLinkUri(url),
          HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        },
      }),
      TextStyle,
      RangedFontSize,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      ParagraphLineHeight,
      Collaboration.configure({
        fragment,
        yUndoOptions: { undoManager: sharedUndoManager(doc.undoManager) },
      }),
    ],
    [doc, fragment],
  );

  const editor = useEditor(
    {
      extensions,
      autofocus: selectAll ? "all" : "end",
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: { role: "textbox", "aria-multiline": "true", "aria-label": "Text", spellcheck: "true" },
        handleKeyDown: (_view, e) => {
          if (e.key === "Escape") {
            if (linkOpenRef.current) return false; // the link field handles its own Escape
            e.preventDefault();
            doneRef.current();
            return true;
          }
          if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
            e.preventDefault();
            setLinkOpen(true);
            return true;
          }
          return false;
        },
      },
      onUpdate: () => edit.current?.(),
    },
    [extensions],
  );

  // Stickies and text boxes grow to fit what is typed (the font size never changes).
  useEffect(() => {
    edit.current = () => {
      const obj = doc.get(objectId);
      const frag = doc.content(objectId);
      if (!obj || !frag) return;
      if (obj.type === "sticky") {
        const pad = STICKY_PADDING_PX * 2;
        const need = measureTextHeight(richTextToHtml(frag), obj.w - pad, STICKY_FONT_PX[obj.size], STICKY_LINE_HEIGHT) + pad;
        if (need > obj.h + 0.5) doc.update(objectId, { h: Math.ceil(need) });
      } else if (obj.type === "text") {
        const box = measureTextBox(richTextToHtml(frag), {
          fontSize: obj.fontSize,
          lineHeight: obj.lineHeight,
          width: obj.autoWidth ? undefined : obj.w,
        });
        // A little room for the caret after the last character.
        const w = obj.autoWidth ? Math.max(Math.ceil(box.w) + 2, 16) : obj.w;
        const h = Math.ceil(box.h);
        if (Math.abs(w - obj.w) > 0.5 || Math.abs(h - obj.h) > 0.5) doc.update(objectId, { w, h });
      }
    };
    return () => {
      edit.current = null;
    };
  }, [doc, objectId]);

  // The key that started editing a sticky is its first character.
  const typed = useRef(false);
  useEffect(() => {
    if (!editor || !initialText || typed.current) return;
    const t = setTimeout(() => {
      if (typed.current || editor.isDestroyed) return;
      typed.current = true;
      editor.chain().focus("end").insertContent(initialText).run();
    }, 0);
    return () => clearTimeout(t);
  }, [editor, initialText]);

  // Focus right away (Tiptap's autofocus waits a tick, and a fast typist's first key would miss the editor).
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.commands.focus(selectAll ? "all" : "end");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    onEditor?.(editor);
    return () => onEditor?.(null);
  }, [editor, onEditor]);

  const applyLink = (raw: string): boolean => {
    if (!editor) return false;
    if (raw.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return true;
    }
    const href = normalizeLinkHref(raw);
    if (!href) return false;
    return editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  };

  return (
    <div
      data-editing-surface=""
      data-rich-editor=""
      className={`atelier-rich atelier-editor ${className ?? ""}`}
      data-nowrap={style?.whiteSpace === "pre" ? "" : undefined}
      style={{
        ...style,
        position: style?.position ?? "relative",
        pointerEvents: "auto",
        userSelect: "text",
        cursor: "text",
        ["--editor-pad" as string]: padding ?? "0px",
      }}
    >
      <EditorContent editor={editor} />
      {linkOpen && editor ? (
        <LinkPrompt
          initial={(editor.getAttributes("link").href as string | undefined) ?? ""}
          onApply={(raw) => {
            if (!applyLink(raw)) return false;
            setLinkOpen(false);
            return true;
          }}
          onCancel={() => {
            setLinkOpen(false);
            editor.commands.focus();
          }}
        />
      ) : null}
    </div>
  );
}

/** The ⌘K field: a small address box above the text at a constant screen size. Empty input removes the link. */
function LinkPrompt({ initial, onApply, onCancel }: { initial: string; onApply: (raw: string) => boolean; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!onApply(value)) setInvalid(true);
  };

  return (
    <form
      onSubmit={submit}
      aria-label="Link"
      style={{
        position: "absolute",
        left: 0,
        bottom: "100%",
        transformOrigin: "0 100%",
        transform: "scale(var(--inv-zoom, 1))",
        marginBottom: "var(--space-2)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-1)",
        padding: "var(--space-2)",
        background: "var(--color-surface)",
        color: "var(--color-ink)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--elev-2)",
        fontSize: "var(--text-sm)",
        lineHeight: 1.4,
        whiteSpace: "nowrap",
        zIndex: "var(--z-overlay)" as unknown as number,
      }}
    >
      <input
        ref={input}
        aria-label="Link address"
        aria-invalid={invalid}
        placeholder="https://"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setInvalid(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }
        }}
        style={{
          width: 240,
          padding: "var(--space-1) var(--space-2)",
          font: "inherit",
          color: "inherit",
          background: "var(--color-bg)",
          border: `1px solid ${invalid ? "var(--color-danger)" : "var(--color-border)"}`,
          borderRadius: "var(--radius-sm)",
        }}
      />
      {invalid ? (
        <span role="alert" style={{ color: "var(--color-danger)" }}>
          Use an http(s) or mailto address
        </span>
      ) : null}
    </form>
  );
}
