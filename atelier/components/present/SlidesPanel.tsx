"use client";

import { ArrowDown, ArrowUp, GripVertical, Play, StickyNote } from "lucide-react";
import { useMemo, useState, type DragEvent } from "react";
import { useEditor } from "@/components/editor/EditorContext";
import { useDocTick } from "@/components/panels/doc-hooks";
import { zoomSelectionCamera } from "@/lib/engine/input/gestures";
import { moveSlide, setSlideOrder, slidesOfDoc } from "@/lib/engine/present/doc-slides";

const DRAG_TYPE = "application/x-atelier-slides";

const iconButton =
  "inline-flex size-(--target-min) shrink-0 items-center justify-center rounded-sm text-fg-muted transition-[transform,opacity,background-color] duration-(--dur-fast) ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 hoverable:bg-(--color-selection-fill) hoverable:text-fg";

/**
 * The Slides panel: the board's frames in presentation order. Reorder with the arrow buttons (keyboard and screen
 * reader friendly) or by dragging a row; click a name to find the frame on the board; the play button presents from
 * that slide. Reordering writes the frames' `order` keys, one undo step, and leaves their z-order alone.
 */
export function SlidesPanel() {
  const { handle, run, commandCtx } = useEditor();
  const { doc, selection } = handle;
  const tick = useDocTick(doc, () => true);
  const slides = useMemo(() => {
    void tick;
    return slidesOfDoc(doc);
  }, [doc, tick]);
  const [status, setStatus] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const announce = (id: string) => {
    const now = slidesOfDoc(doc);
    const s = now.find((x) => x.id === id);
    if (s) setStatus(`${s.name} is now slide ${s.index + 1} of ${now.length}`);
  };
  const move = (id: string, delta: -1 | 1) => {
    if (moveSlide(doc, id, delta)) announce(id);
  };
  const show = (id: string) => {
    selection.set([id]);
    const cam = zoomSelectionCamera(doc, new Set([id]), handle.viewport());
    if (cam) handle.setCamera(cam, { animate: true });
  };
  const presentFrom = (index: number) => commandCtx().ui?.startPresent?.({ index });

  const onDrop = (e: DragEvent, targetId: string) => {
    e.preventDefault();
    const fromId = e.dataTransfer.getData(DRAG_TYPE);
    setDragId(null);
    setOverId(null);
    if (!fromId || fromId === targetId) return;
    const ids = slides.map((s) => s.id);
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    setSlideOrder(doc, ids);
    announce(fromId);
  };

  if (slides.length === 0) {
    return (
      <div className="flex flex-col gap-2 px-4 py-6">
        <p className="text-(length:--text-sm) text-fg-muted">Add frames to build slides. Draw one with the Frame tool (F); each frame is one slide, in the order shown here.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-(length:--text-xs) text-fg-muted">
          {slides.length} {slides.length === 1 ? "slide" : "slides"}
        </p>
        <button
          type="button"
          onClick={() => run("present.start")}
          className="inline-flex min-h-(--target-min) items-center gap-2 rounded-sm bg-brand px-3 text-(length:--text-sm) font-medium text-on-brand transition-transform duration-(--dur-fast) ease-out active:scale-[0.97]"
        >
          <Play aria-hidden="true" size={14} />
          Present
        </button>
      </div>
      <ol aria-label="Slide order" className="m-0 flex list-none flex-col gap-1 p-0">
        {slides.map((s, i) => (
          <li
            key={s.id}
            data-slide-id={s.id}
            data-slide-name={s.name}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_TYPE, s.id);
              e.dataTransfer.effectAllowed = "move";
              setDragId(s.id);
            }}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setOverId(s.id);
            }}
            onDragLeave={() => setOverId((cur) => (cur === s.id ? null : cur))}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            onDrop={(e) => onDrop(e, s.id)}
            className={`flex items-center gap-1 rounded-md border bg-panel px-1 py-1 ${overId === s.id && dragId !== s.id ? "border-select bg-(--color-selection-fill)" : "border-line"} ${dragId === s.id ? "opacity-60" : ""}`}
          >
            <GripVertical aria-hidden="true" size={16} className="shrink-0 cursor-grab text-fg-muted" />
            <span className="w-5 shrink-0 text-center text-(length:--text-xs) font-medium text-fg-muted tabular-nums">{i + 1}</span>
            <button
              type="button"
              aria-label={`Show ${s.name} on the board`}
              onClick={() => show(s.id)}
              className="min-h-(--target-min) min-w-0 flex-1 truncate rounded-sm px-1 text-left text-(length:--text-sm) text-fg hoverable:bg-(--color-selection-fill)"
            >
              {s.name}
            </button>
            {s.notes.trim() !== "" ? (
              <span className="inline-flex shrink-0 items-center text-fg-muted" title="Has presenter notes">
                <StickyNote aria-hidden="true" size={14} />
                <span className="sr-only">Has notes</span>
              </span>
            ) : null}
            <button type="button" aria-label={`Move ${s.name} earlier`} disabled={i === 0} onClick={() => move(s.id, -1)} className={iconButton}>
              <ArrowUp aria-hidden="true" size={16} />
            </button>
            <button type="button" aria-label={`Move ${s.name} later`} disabled={i === slides.length - 1} onClick={() => move(s.id, 1)} className={iconButton}>
              <ArrowDown aria-hidden="true" size={16} />
            </button>
            <button type="button" aria-label={`Present from ${s.name}`} onClick={() => presentFrom(i)} className={iconButton}>
              <Play aria-hidden="true" size={14} />
            </button>
          </li>
        ))}
      </ol>
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
    </div>
  );
}
