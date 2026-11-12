"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Frame as FrameIcon,
  Group as GroupIcon,
  Image as ImageIcon,
  Lock,
  LockOpen,
  PenLine,
  Shapes,
  StickyNote,
  Type,
  MoveUpRight,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import { RovingToolbar } from "@/components/ui/RovingToolbar";
import { useEditor } from "@/components/editor/EditorContext";
import { selectedRoots } from "@/lib/engine/commands/commands";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { cameraToReveal } from "@/lib/engine/commands/focus";
import { dropObjects, reorderObjects, type DropTarget } from "@/lib/engine/commands/z-order";
import { boundsOf } from "@/lib/engine/geometry/rect";
import { oneStepOn } from "@/lib/engine/model/one-step";
import type { CanvasObject, ObjectType } from "@/lib/engine/model/types";
import { useDocTick, useMediaQuery, useSelectionIds } from "./doc-hooks";
import { descendantIds, layerName, layerRows, rowSignature, type LayerRow } from "./layers-model";

const ICONS: Record<ObjectType, LucideIcon> = {
  image: ImageIcon,
  text: Type,
  sticky: StickyNote,
  shape: Shapes,
  arrow: MoveUpRight,
  frame: FrameIcon,
  stroke: PenLine,
  group: GroupIcon,
};

/** Windowing starts above this many visible rows. */
export const VIRTUALIZE_ABOVE = 100;
const ROW_PX = 32;
const ROW_PX_COARSE = 44;
const OVERSCAN = 8;
const FALLBACK_VIEWPORT_PX = 480;
const DRAG_TYPE = "application/x-atelier-layers";

type DropHint = { id: string; where: "above" | "below" | "into" } | null;

const iconButton =
  "inline-flex size-(--target-min) shrink-0 items-center justify-center rounded-sm text-fg-muted transition-[transform,opacity,background-color] duration-(--dur-fast) ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 hoverable:bg-(--color-selection-fill) hoverable:text-fg";

export function LayersPanel() {
  const { handle, hidden } = useEditor();
  const { doc, selection } = handle;
  const selected = useSelectionIds(selection);
  const coarse = useMediaQuery("(pointer: coarse)", false);
  const rowPx = coarse ? ROW_PX_COARSE : ROW_PX;

  const helpId = useId();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropHint>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportPx, setViewportPx] = useState(FALLBACK_VIEWPORT_PX);
  const [anchor, setAnchor] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);

  // Rebuild rows only when something that shows in Layers changed: layer added/removed/renamed/locked/reordered.
  const sigs = useRef(new Map<string, string>());
  const tick = useDocTick(doc, (changed) => {
    let differs = false;
    for (const id of changed) {
      const sig = rowSignature(doc, doc.get(id));
      if (sigs.current.get(id) !== sig) differs = true;
      if (sig) sigs.current.set(id, sig);
      else sigs.current.delete(id);
    }
    return differs;
  });

  const rows = useMemo(() => {
    void tick;
    return layerRows(doc, collapsed);
  }, [doc, collapsed, tick]);
  const virtual = rows.length > VIRTUALIZE_ABOVE;
  const indexOf = useMemo(() => new Map(rows.map((r, i) => [r.id, i])), [rows]);

  // Measure the scroll area for windowing.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setViewportPx(el.clientHeight || FALLBACK_VIEWPORT_PX);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A selection made on the canvas opens the folders that hide it, and becomes the active row. Adjusting state while
  // rendering (instead of in an effect) avoids a frame with the stale rows.
  const [seenSelection, setSeenSelection] = useState(selected);
  if (seenSelection !== selected) {
    setSeenSelection(selected);
    const picked = [...selected];
    if (picked.length > 0) {
      const open = new Set<string>();
      for (const id of picked) {
        let p = doc.get(id)?.parentId ?? null;
        for (let d = 0; p && d < 32; d++) {
          open.add(p);
          p = doc.get(p)?.parentId ?? null;
        }
      }
      if ([...open].some((id) => collapsed.has(id))) {
        const next = new Set(collapsed);
        for (const id of open) next.delete(id);
        setCollapsed(next);
      }
      setActiveId(picked[picked.length - 1]);
      setAnchor(picked[picked.length - 1]);
    }
  }

  const active = activeId && indexOf.has(activeId) ? activeId : (rows[0]?.id ?? null);

  const scrollToRow = useCallback(
    (id: string) => {
      const i = indexOf.get(id);
      const el = scroller.current;
      if (i === undefined || !el) return;
      const top = i * rowPx;
      const h = el.clientHeight || FALLBACK_VIEWPORT_PX;
      if (top < el.scrollTop) el.scrollTop = top;
      else if (top + rowPx > el.scrollTop + h) el.scrollTop = top + rowPx - h;
      setScrollTop(el.scrollTop);
    },
    [indexOf, rowPx],
  );

  const activate = useCallback(
    (id: string) => {
      setActiveId(id);
      scrollToRow(id);
    },
    [scrollToRow],
  );

  const visibleRows = useMemo(() => {
    if (!virtual) return rows.map((row, i) => ({ row, i }));
    const first = Math.max(0, Math.floor(scrollTop / rowPx) - OVERSCAN);
    const last = Math.min(rows.length, Math.ceil((scrollTop + viewportPx) / rowPx) + OVERSCAN);
    return rows.slice(first, last).map((row, k) => ({ row, i: first + k }));
  }, [virtual, rows, scrollTop, viewportPx, rowPx]);

  // ---- actions ----
  const selectedList = useMemo(() => {
    void tick; // lock state and parents may have changed
    return selectedRoots(doc, selected, true);
  }, [doc, selected, tick]);
  const move = (op: "forward" | "backward") => reorderObjects(doc, selectedList, op);
  const canMoveUp = selectedList.length > 0 && !allAt(doc, selectedList, "top");
  const canMoveDown = selectedList.length > 0 && !allAt(doc, selectedList, "bottom");
  const allLocked = selectedList.length > 0 && selectedList.every((o) => o.locked);
  const allHidden = selectedList.length > 0 && selectedList.every((o) => hidden.ids.has(o.id));

  const toggleLockOf = (ids: string[], lock: boolean) => {
    const targets: CanvasObject[] = [];
    for (const id of ids) {
      const o = doc.get(id);
      if (!o) continue;
      targets.push(o);
      if (o.type === "group") for (const d of descendantIds(doc, id)) targets.push(doc.get(d)!);
    }
    oneStepOn(doc, () => targets.filter(Boolean).forEach((o) => doc.update(o.id, { locked: lock })));
  };

  const reveal = (id: string, animate: boolean) => {
    const o = doc.get(id);
    if (!o) return;
    const cam = cameraToReveal(handle.getCamera(), handle.viewport(), boundsOf(o));
    if (cam) handle.setCamera(cam, { animate });
  };

  const select = (id: string, e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
    if (e.ctrlKey || e.metaKey) {
      selection.toggle(id);
      setAnchor(id);
    } else if (e.shiftKey && anchor && indexOf.has(anchor)) {
      const a = indexOf.get(anchor)!;
      const b = indexOf.get(id)!;
      selection.set(rows.slice(Math.min(a, b), Math.max(a, b) + 1).map((r) => r.id));
    } else {
      selection.set([id]);
      setAnchor(id);
    }
    setActiveId(id);
  };

  const setExpanded = (id: string, expand: boolean) =>
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (expand) next.delete(id);
      else next.add(id);
      return next;
    });

  const commitRename = (id: string, name: string) => {
    setRenaming(null);
    const o = doc.get(id);
    const trimmed = name.trim();
    if (o?.type === "frame" && trimmed && trimmed !== o.name) {
      oneStepOn(doc, () => doc.update(id, { name: trimmed }));
    }
    treeRef.current?.focus();
  };

  // ---- keyboard ----
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (renaming) return;
    const i = active ? (indexOf.get(active) ?? 0) : 0;
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      if (selectedList.length === 0 && active) selection.set([active]); // acts on the active row when nothing is selected
      const list = selectedList.length ? selectedList : active ? [doc.get(active)].filter((o): o is CanvasObject => !!o) : [];
      reorderObjects(doc, list, e.key === "ArrowUp" ? "forward" : "backward");
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const row = active ? rows[indexOf.get(active) ?? -1] : undefined;
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp": {
        e.preventDefault();
        const next = rows[Math.min(rows.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)))];
        if (!next) return;
        activate(next.id);
        if (e.shiftKey) {
          const a = indexOf.get(anchor ?? next.id) ?? i;
          const b = indexOf.get(next.id)!;
          selection.set(rows.slice(Math.min(a, b), Math.max(a, b) + 1).map((r) => r.id));
        }
        break;
      }
      case "Home":
      case "End": {
        e.preventDefault();
        const target = e.key === "Home" ? rows[0] : rows[rows.length - 1];
        if (target) activate(target.id);
        break;
      }
      case "ArrowRight":
        if (row?.expandable) {
          e.preventDefault();
          if (!row.expanded) setExpanded(row.id, true);
          else if (rows[i + 1]) activate(rows[i + 1].id);
        }
        break;
      case "ArrowLeft":
        if (row?.expandable && row.expanded) {
          e.preventDefault();
          setExpanded(row.id, false);
        } else if (row && row.depth > 0) {
          e.preventDefault();
          const parent = row.obj.parentId;
          if (parent && indexOf.has(parent)) activate(parent);
        }
        break;
      case "Enter":
      case " ":
        if (row) {
          e.preventDefault();
          select(row.id, e);
        }
        break;
      case "F2":
        if (row?.obj.type === "frame") {
          e.preventDefault();
          setRenaming(row.id);
        }
        break;
    }
  };

  // ---- drag and drop ----
  const hintFor = (row: LayerRow, e: DragEvent<HTMLElement>): "above" | "below" | "into" => {
    const r = e.currentTarget.getBoundingClientRect();
    const f = r.height > 0 ? (e.clientY - r.top) / r.height : 0.5;
    const container = row.obj.type === "frame" || row.obj.type === "group";
    if (container && f > 0.25 && f < 0.75) return "into";
    return f < 0.5 ? "above" : "below";
  };

  const onDragStart = (row: LayerRow, e: DragEvent<HTMLElement>) => {
    const ids = selected.has(row.id) ? [...selected] : [row.id];
    if (!selected.has(row.id)) selection.set([row.id]);
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(ids));
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragOver = (row: LayerRow, e: DragEvent<HTMLElement>) => {
    if (!Array.from(e.dataTransfer?.types ?? []).includes(DRAG_TYPE) && !e.dataTransfer?.getData?.(DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const where = hintFor(row, e);
    setDrop((cur) => (cur?.id === row.id && cur.where === where ? cur : { id: row.id, where }));
  };

  const onDrop = (row: LayerRow, e: DragEvent<HTMLElement>) => {
    const raw = e.dataTransfer.getData(DRAG_TYPE);
    setDrop(null);
    if (!raw) return;
    e.preventDefault();
    let ids: string[];
    try {
      ids = (JSON.parse(raw) as unknown[]).filter((x): x is string => typeof x === "string");
    } catch {
      return;
    }
    const where = hintFor(row, e);
    // Layers list top-first, so "above" in the list is "in front" in z-order.
    const target: DropTarget = where === "into" ? { into: row.id } : { relativeTo: row.id, position: where };
    dropObjects(doc, ids, target);
  };

  const total = rows.length * rowPx;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <RovingToolbar label="Layer actions" className="flex items-center gap-1 border-b border-line px-2 py-1">
        <button type="button" aria-label="Move up" title="Move up (Alt+Up)" className={iconButton} disabled={!canMoveUp} onClick={() => move("forward")}>
          <ArrowUp aria-hidden="true" size={16} />
        </button>
        <button type="button" aria-label="Move down" title="Move down (Alt+Down)" className={iconButton} disabled={!canMoveDown} onClick={() => move("backward")}>
          <ArrowDown aria-hidden="true" size={16} />
        </button>
        <button
          type="button"
          aria-label={allLocked ? "Unlock selected" : "Lock selected"}
          title={allLocked ? "Unlock selected" : "Lock selected"}
          className={iconButton}
          disabled={selectedList.length === 0}
          onClick={() => toggleLockOf(selectedList.map((o) => o.id), !allLocked)}
        >
          {allLocked ? <LockOpen aria-hidden="true" size={16} /> : <Lock aria-hidden="true" size={16} />}
        </button>
        <button
          type="button"
          aria-label={allHidden ? "Show selected" : "Hide selected"}
          title={allHidden ? "Show selected" : "Hide selected"}
          className={iconButton}
          disabled={selectedList.length === 0}
          onClick={() => hidden.set(selectedList.map((o) => o.id), !allHidden)}
        >
          {allHidden ? <Eye aria-hidden="true" size={16} /> : <EyeOff aria-hidden="true" size={16} />}
        </button>
      </RovingToolbar>

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-(length:--text-sm) text-fg-muted">Nothing on this board yet. Press N for a sticky note or T for text.</p>
      ) : (
        <div
          ref={scroller}
          data-testid="layers-scroll"
          className="min-h-0 flex-1 overflow-y-auto"
          onScroll={(e) => virtual && setScrollTop(e.currentTarget.scrollTop)}
        >
          <div
            ref={treeRef}
            role="tree"
            data-autofocus=""
            aria-label="Layers"
            aria-describedby={helpId}
            aria-multiselectable="true"
            aria-activedescendant={active ? `layer-${active}` : undefined}
            tabIndex={0}
            onKeyDown={onKeyDown}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop(null);
            }}
            onDragEnd={() => setDrop(null)}
            className="relative rounded-sm outline-offset-[-2px]"
            style={virtual ? { height: total } : undefined}
          >
            {visibleRows.map(({ row, i }) => {
              const o = row.obj;
              const name = layerName(doc, o);
              const isSel = selected.has(row.id);
              const isHidden = hidden.ids.has(row.id);
              const Icon = ICONS[o.type];
              const hint = drop?.id === row.id ? drop.where : null;
              const label = `${name}${o.locked ? ", locked" : ""}${isHidden ? ", hidden" : ""}`;
              return (
                <div
                  key={row.id}
                  id={`layer-${row.id}`}
                  role="treeitem"
                  aria-level={row.depth + 1}
                  aria-posinset={row.pos}
                  aria-setsize={row.setSize}
                  aria-selected={isSel}
                  aria-expanded={row.expandable ? row.expanded : undefined}
                  aria-label={label}
                  draggable
                  onDragStart={(e) => onDragStart(row, e)}
                  onDragOver={(e) => onDragOver(row, e)}
                  onDrop={(e) => onDrop(row, e)}
                  onClick={(e: MouseEvent) => select(row.id, e)}
                  onDoubleClick={() => {
                    if (o.type === "frame") setRenaming(row.id);
                    else reveal(row.id, true);
                  }}
                  data-active={row.id === active ? "true" : undefined}
                  className={`group flex items-center gap-1 pr-1 text-(length:--text-sm) select-none ${
                    isSel ? "bg-(--color-selection-fill) text-fg" : "text-fg"
                  } ${isHidden ? "opacity-50" : ""} ${row.id === active ? "outline-2 -outline-offset-2 outline-(--color-selection)" : ""}`}
                  style={{
                    height: rowPx,
                    paddingLeft: 8 + row.depth * 16,
                    ...(virtual ? { position: "absolute", top: i * rowPx, left: 0, right: 0 } : null),
                    ...(hint === "above" ? { boxShadow: "inset 0 2px 0 var(--color-selection)" } : null),
                    ...(hint === "below" ? { boxShadow: "inset 0 -2px 0 var(--color-selection)" } : null),
                    ...(hint === "into" ? { boxShadow: "inset 0 0 0 2px var(--color-selection)" } : null),
                  }}
                >
                  {row.expandable ? (
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={row.expanded ? `Collapse ${name}` : `Expand ${name}`}
                      className={iconButton}
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpanded(row.id, !row.expanded);
                      }}
                    >
                      {row.expanded ? <ChevronDown aria-hidden="true" size={14} /> : <ChevronRight aria-hidden="true" size={14} />}
                    </button>
                  ) : (
                    <span aria-hidden="true" className="inline-block size-(--target-min) shrink-0" />
                  )}
                  <Icon aria-hidden="true" size={16} className="shrink-0 text-fg-muted" />
                  {renaming === row.id ? (
                    <RenameInput initial={o.type === "frame" ? o.name : name} onCommit={(v) => commitRename(row.id, v)} onCancel={() => { setRenaming(null); treeRef.current?.focus(); }} />
                  ) : (
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                  )}
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={`${o.locked ? "Unlock" : "Lock"} ${name}`}
                    aria-pressed={o.locked}
                    className={`${iconButton} ${o.locked ? "" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(pointer:coarse)]:opacity-100"}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleLockOf([row.id], !o.locked);
                    }}
                  >
                    {o.locked ? <Lock aria-hidden="true" size={14} /> : <LockOpen aria-hidden="true" size={14} />}
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={`${isHidden ? "Show" : "Hide"} ${name}`}
                    aria-pressed={isHidden}
                    className={`${iconButton} ${isHidden ? "" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(pointer:coarse)]:opacity-100"}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      hidden.set([row.id], !isHidden);
                    }}
                  >
                    {isHidden ? <EyeOff aria-hidden="true" size={14} /> : <Eye aria-hidden="true" size={14} />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <p className="sr-only" id={helpId}>
        Use arrow keys to move between layers, Enter to select, Alt with Up or Down to change the stacking order.
      </p>
    </div>
  );
}

function allAt(doc: BoardDoc, objs: CanvasObject[], end: "top" | "bottom"): boolean {
  // True when moving the block that way would change nothing: every selected layer already sits at that end of its siblings.
  const byParent = new Map<string | null, Set<string>>();
  for (const o of objs) byParent.set(o.parentId, (byParent.get(o.parentId) ?? new Set()).add(o.id));
  for (const [parent, sel] of byParent) {
    const sibs = doc.childrenOf(parent).map((o) => o.id);
    const slice = end === "top" ? sibs.slice(sibs.length - sel.size) : sibs.slice(0, sel.size);
    if (!slice.every((id) => sel.has(id))) return false;
  }
  return true;
}

function RenameInput({ initial, onCommit, onCancel }: { initial: string; onCommit(v: string): void; onCancel(): void }) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  return (
    <input
      autoFocus
      aria-label="Frame name"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          done.current = true;
          onCommit(value);
        } else if (e.key === "Escape") {
          done.current = true;
          onCancel();
        }
      }}
      onBlur={() => {
        if (!done.current) onCommit(value);
      }}
      className="min-h-6 min-w-0 flex-1 rounded-sm border border-line bg-panel px-1 text-(length:--text-sm) text-fg"
    />
  );
}
