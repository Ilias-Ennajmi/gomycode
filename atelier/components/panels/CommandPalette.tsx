"use client";

import { Command as CommandIcon, FileText, Frame as FrameIcon, LayoutGrid, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useEditor } from "@/components/editor/EditorContext";
import { cameraToReveal } from "@/lib/engine/commands/focus";
import { fuzzyFilter } from "@/lib/engine/commands/fuzzy";
import { formatShortcut } from "@/lib/engine/commands/shortcuts";
import { boundsOf } from "@/lib/engine/geometry/rect";
import { objectText } from "@/lib/engine/model/search";
import { readBoardList, type BoardSummary } from "@/lib/sync/board-list-cache";
import { layerName, typeLabel } from "./layers-model";

type Kind = "command" | "object" | "board";
type Item = { key: string; kind: Kind; label: string; hint: string; shortcut?: string; run(): void };

const LIMITS = { query: { command: 10, object: 8, board: 6 }, empty: { command: 24, object: 0, board: 5 } } as const;
const SECTION_LABEL: Record<Kind, string> = { command: "Commands", object: "On this board", board: "Boards" };
const GROUP_LABEL: Record<string, string> = { edit: "Edit", arrange: "Arrange", view: "View", insert: "Insert", board: "Board" };

/**
 * Mod+K: one search box for every command, board and object. A native modal dialog (focus trapped, Escape closes,
 * focus returns to where it was) around the ARIA combobox pattern. It opens and closes without animating.
 */
export function CommandPalette() {
  const { palette } = useEditor();
  return palette.open ? <PaletteDialog onClose={() => palette.setOpen(false)} /> : null;
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const { handle, registry, commandCtx, navigate } = useEditor();
  const { doc, selection } = handle;
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const uid = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  // Native modal behaviour and focus return.
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (typeof el.showModal === "function") {
      if (!el.open) el.showModal();
    } else el.setAttribute("open", "");
    input.current?.focus();
    return () => {
      if (typeof el.close === "function" && el.open) el.close();
      if (opener?.isConnected) opener.focus();
      else handle.container().focus();
    };
  }, [handle]);

  useEffect(() => {
    let live = true;
    void readBoardList().then((l) => {
      if (live) setBoards(l.boards);
    });
    return () => {
      live = false;
    };
  }, []);

  // Text of every object, read once when the palette opens.
  const objects = useMemo(
    () =>
      doc
        .all()
        .map((o) => ({ id: o.id, text: objectText(doc, o.id).replace(/\s+/g, " ").trim(), o }))
        .filter((x) => x.text !== ""),
    [doc],
  );

  const items = useMemo<Item[]>(() => {
    const q = query.trim();
    const lim = q ? LIMITS.query : LIMITS.empty;
    const ctx = commandCtx({ animate: false });
    const run = (fn: () => void) => () => {
      onClose();
      // After the dialog has closed and focus has returned, so a command that opens a panel can focus it.
      setTimeout(fn, 0);
    };

    const commands = registry.all().filter((c) => registry.available(c.id, ctx));
    const cmdItems: Item[] = fuzzyFilter(q, commands, (c) => `${c.label} ${GROUP_LABEL[c.group] ?? c.group}`)
      .slice(0, lim.command)
      .map((c) => ({
        key: `cmd:${c.id}`,
        kind: "command",
        label: c.label,
        hint: GROUP_LABEL[c.group] ?? c.group,
        shortcut: c.shortcut ? formatShortcut(c.shortcut) : undefined,
        run: run(() => registry.run(c.id, commandCtx({ animate: false }))),
      }));

    const objItems: Item[] = q
      ? fuzzyFilter(q, objects, (x) => x.text)
          .slice(0, lim.object)
          .map((x) => ({
            key: `obj:${x.id}`,
            kind: "object",
            label: layerName(doc, x.o),
            hint: typeLabel(x.o),
            run: run(() => {
              const o = doc.get(x.id);
              if (!o) return;
              selection.set([x.id]);
              const cam = cameraToReveal(handle.getCamera(), handle.viewport(), boundsOf(o));
              if (cam) handle.setCamera(cam, { animate: false });
            }),
          }))
      : [];

    const boardItems: Item[] = fuzzyFilter(q, boards, (b) => b.title || "Untitled")
      .slice(0, lim.board)
      .map((b) => ({ key: `board:${b.id}`, kind: "board", label: b.title || "Untitled", hint: "Board", run: run(() => navigate(`/b/${b.id}`)) }));

    return [...cmdItems, ...objItems, ...boardItems];
  }, [query, objects, boards, registry, commandCtx, doc, selection, handle, navigate, onClose]);

  const current = Math.min(active, Math.max(0, items.length - 1));

  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>(`[data-index="${current}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [current, items]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault(); // the dialog's own cancel event does the same where it exists
      onClose();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (items.length === 0) return;
      setActive((current + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[current]?.run();
    }
  };

  const sections = (["command", "object", "board"] as Kind[])
    .map((kind) => ({ kind, entries: items.map((item, index) => ({ item, index })).filter((x) => x.item.kind === kind) }))
    .filter((s) => s.entries.length > 0);

  return (
    <dialog
      ref={dialog}
      aria-label="Command palette"
      onCancel={(e) => {
        e.preventDefault();
        closeRef.current();
      }}
      onMouseDown={(e) => {
        if (e.target === dialog.current) closeRef.current(); // the backdrop counts as the dialog itself
      }}
      className="mx-auto mt-[12vh] mb-auto w-[min(36rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-line bg-panel p-0 text-fg shadow-3 backdrop:bg-(--color-scrim)"
    >
      <div className="flex items-center gap-2 border-b border-line px-3">
        <Search aria-hidden="true" size={16} className="shrink-0 text-fg-muted" />
        <input
          ref={input}
          role="combobox"
          aria-label="Search commands, boards and objects"
          aria-expanded="true"
          aria-controls={`${uid}-list`}
          aria-autocomplete="list"
          aria-activedescendant={items.length ? `${uid}-opt-${current}` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder="Search commands, boards and objects"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          style={{ outlineOffset: -2 }}
          className="min-h-12 min-w-0 flex-1 rounded-sm bg-transparent px-1 text-(length:--text-md) text-fg placeholder:text-fg-muted"
        />
      </div>
      <div ref={list} id={`${uid}-list`} role="listbox" aria-label="Results" className="max-h-[min(24rem,60dvh)] overflow-y-auto p-1">
        {sections.map(({ kind, entries }) => (
          <div key={kind} role="group" aria-label={SECTION_LABEL[kind]}>
            <p aria-hidden="true" className="px-3 pt-2 pb-1 text-(length:--text-xs) font-medium text-fg-muted">
              {SECTION_LABEL[kind]}
            </p>
            {entries.map(({ item, index }) => (
              <div
                key={item.key}
                id={`${uid}-opt-${index}`}
                role="option"
                aria-selected={index === current}
                data-index={index}
                onPointerMove={() => index !== current && setActive(index)}
                onClick={() => item.run()}
                className={`flex min-h-(--target-min) cursor-default items-center gap-3 rounded-sm px-3 py-1 text-(length:--text-sm) ${
                  index === current ? "bg-(--color-selection-fill) text-fg" : "text-fg"
                }`}
              >
                {item.kind === "command" ? (
                  <CommandIcon aria-hidden="true" size={14} className="shrink-0 text-fg-muted" />
                ) : item.kind === "board" ? (
                  <LayoutGrid aria-hidden="true" size={14} className="shrink-0 text-fg-muted" />
                ) : item.hint === "Frame" ? (
                  <FrameIcon aria-hidden="true" size={14} className="shrink-0 text-fg-muted" />
                ) : (
                  <FileText aria-hidden="true" size={14} className="shrink-0 text-fg-muted" />
                )}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                <span className="shrink-0 text-(length:--text-xs) text-fg-muted">{item.shortcut ?? item.hint}</span>
              </div>
            ))}
          </div>
        ))}
        {items.length === 0 ? (
          <p role="status" className="px-3 py-6 text-center text-(length:--text-sm) text-fg-muted">
            No results
          </p>
        ) : null}
      </div>
    </dialog>
  );
}
