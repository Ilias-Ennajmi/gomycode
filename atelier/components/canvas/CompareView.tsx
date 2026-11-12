"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { chromeButton, chromeTextButton } from "@/components/chrome/controls";
import { useIsDesktop } from "@/components/panels/doc-hooks";
import type { AssetResolver } from "@/lib/assets/resolver-types";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { fitRect, type Camera } from "@/lib/engine/geometry/camera";
import { boundsOf, unionRects } from "@/lib/engine/geometry/rect";
import type { FrameObj } from "@/lib/engine/model/types";
import { slideCamera, slidesOf } from "@/lib/engine/present/slides";
import { linkCameras } from "@/lib/engine/rounds/camera-sync";
import { decodeDoc } from "@/lib/engine/rounds/decode";
import { describeObject } from "@/lib/engine/rounds/describe";
import { diffObjects, summariseDiff } from "@/lib/engine/rounds/diff";
import { SpatialIndex } from "@/lib/engine/spatial/spatial-index";
import { CanvasView, type CanvasHandle } from "./CanvasView";

export interface CompareSide {
  doc: BoardDoc;
  /** "Round 2", "Current board": what the side is called on screen. */
  label: string;
}

type Mode = "side" | "swipe";
type Mark = "added" | "changed" | "removed";

const MAX_REMOVED_LISTED = 12;
const FIT_PADDING = 64;

const control = "h-9 rounded-md border border-line bg-panel px-2 text-(length:--text-sm) text-fg pointer-coarse:h-11";

/**
 * A spatial index for one document, made in an effect so React's development double-run (mount, clean up, mount again) leaves a
 * live one: an index the canvas makes for itself in state is destroyed by that clean-up and then answers nothing.
 */
function useSpatialIndex(doc: BoardDoc): SpatialIndex | null {
  const [index, setIndex] = useState<SpatialIndex | null>(null);
  useEffect(() => {
    const made = new SpatialIndex(doc);
    setIndex(made);
    return () => {
      made.destroy();
      setIndex(null);
    };
  }, [doc]);
  return index;
}

/** Outlines the objects in `marks` inside `root` with `data-compare-diff`, including ones that mount later (culling). */
function useDiffMarks(root: () => HTMLElement | null, marks: ReadonlyMap<string, Mark> | null, deps: unknown[]) {
  useEffect(() => {
    const el = root();
    if (!el) return;
    const apply = () => {
      for (const node of el.querySelectorAll<HTMLElement>("[data-object-id]")) {
        const mark = marks?.get(node.dataset.objectId ?? "");
        if (mark) node.setAttribute("data-compare-diff", mark);
        else node.removeAttribute("data-compare-diff");
      }
    };
    apply();
    if (!marks || typeof MutationObserver === "undefined") return;
    const mo = new MutationObserver(apply);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      for (const node of el.querySelectorAll<HTMLElement>("[data-compare-diff]")) node.removeAttribute("data-compare-diff");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marks, ...deps]);
}

/**
 * Two boards side by side, or one over the other behind a slider (Swipe, the touch-friendly mode), always on ONE camera: pan
 * or zoom either and the other follows. Both canvases are read-only. A frame picker (with previous and next) jumps both to the
 * same frame; "Highlight changes" outlines what was added or changed on B and what was removed on A, and the summary lists the
 * removed objects as text. The documents belong to the caller (the loader destroys them when the page closes).
 */
export function CompareView({ a, b, assets, onClose, initialMode }: { a: CompareSide; b: CompareSide; assets: AssetResolver; onClose?: () => void; initialMode?: Mode }) {
  const uid = useId();
  const desktop = useIsDesktop();
  const [mode, setMode] = useState<Mode>(initialMode ?? (desktop ? "side" : "swipe"));
  const [position, setPosition] = useState(50);
  const [highlight, setHighlight] = useState(false);
  const [frameId, setFrameId] = useState("");
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [handleA, setHandleA] = useState<CanvasHandle | null>(null);
  const [handleB, setHandleB] = useState<CanvasHandle | null>(null);
  const paneA = useRef<HTMLElement>(null);
  const paneB = useRef<HTMLElement>(null);
  const indexA = useSpatialIndex(a.doc);
  const indexB = useSpatialIndex(b.doc);

  // What changed, once per pair of documents.
  const compared = useMemo(() => {
    const da = decodeDoc(a.doc);
    const db = decodeDoc(b.doc);
    const diff = diffObjects(da.objects, db.objects, { prev: da.texts, next: db.texts });
    const marksA = new Map<string, Mark>();
    const marksB = new Map<string, Mark>();
    for (const id of diff.removed) marksA.set(id, "removed");
    for (const id of diff.changed) {
      marksA.set(id, "changed");
      marksB.set(id, "changed");
    }
    for (const id of diff.added) marksB.set(id, "added");
    const removed = diff.removed.slice(0, MAX_REMOVED_LISTED).map((id) => describeObject(da.objects.get(id)!, a.doc.content(id)));
    return { diff, totals: summariseDiff(diff), marksA, marksB, removed };
  }, [a.doc, b.doc]);
  useDiffMarks(() => paneA.current, highlight ? compared.marksA : null, [a.doc]);
  useDiffMarks(() => paneB.current, highlight ? compared.marksB : null, [b.doc]);

  // The frames both boards know, in presentation order (B's order first; frames only A has follow).
  const frames = useMemo(() => {
    const inB = slidesOf(b.doc.all().filter((o): o is FrameObj => o.type === "frame"));
    const known = new Set(inB.map((s) => s.id));
    const onlyA = slidesOf(a.doc.all().filter((o): o is FrameObj => o.type === "frame")).filter((s) => !known.has(s.id));
    return [...inB, ...onlyA].map((s, i) => ({ ...s, index: i }));
  }, [a.doc, b.doc]);

  // One camera for both.
  useEffect(() => (handleA && handleB ? linkCameras(handleA, handleB) : undefined), [handleA, handleB]);

  useEffect(() => {
    const el = stage.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize((cur) => (cur.w === r.width && cur.h === r.height ? cur : { w: r.width, h: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const paneSize = useMemo(() => ({ w: mode === "side" ? size.w / 2 : size.w, h: size.h }), [mode, size]);

  const cameraFor = useCallback(
    (id: string): Camera => {
      if (id) {
        const slide = frames.find((s) => s.id === id);
        if (slide) return slideCamera(slide.rect, paneSize);
      }
      const box = unionRects([...a.doc.all(), ...b.doc.all()].map(boundsOf));
      return fitRect(box, paneSize, FIT_PADDING, 1);
    },
    [frames, paneSize, a.doc, b.doc],
  );

  /** Put both canvases on `id` (a frame, or "" for the whole of both boards). */
  const goTo = useCallback(
    (id: string) => {
      setFrameId(id);
      handleA?.setCamera(cameraFor(id), { settle: true });
    },
    [handleA, cameraFor],
  );

  // Frame both boards when they first have a size, and again when the panes change size (a mode switch).
  const fitted = useRef("");
  useEffect(() => {
    if (!handleA || !handleB || paneSize.w <= 0 || paneSize.h <= 0) return;
    const key = `${mode}|${Math.round(paneSize.w)}x${Math.round(paneSize.h)}`;
    if (fitted.current === key) return;
    fitted.current = key;
    handleA.setCamera(cameraFor(frameId), { settle: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleA, handleB, paneSize, mode]);

  const frameIndex = frames.findIndex((f) => f.id === frameId);
  const labelId = `${uid}-title`;
  const { totals } = compared;
  const swipe = mode === "swipe";

  const paneStyle = (side: "a" | "b") => ({
    position: "absolute" as const,
    top: 0,
    bottom: 0,
    left: !swipe && side === "b" ? "50%" : 0,
    width: swipe ? "100%" : "50%",
    ...(swipe && side === "b" ? { clipPath: `inset(0 ${100 - position}% 0 0)` } : {}),
  });

  const chip = "pointer-events-none absolute top-2 z-10 max-w-[45%] truncate rounded-md border border-line bg-panel px-2 py-1 text-(length:--text-xs) font-medium text-fg shadow-1";

  return (
    <div role="region" aria-labelledby={labelId} data-compare="" className="fixed inset-0 z-(--z-panel) flex flex-col bg-canvas text-fg">
      <header className="flex shrink-0 flex-col gap-2 border-b border-line bg-panel px-3 py-2">
        <div className="flex items-center gap-3">
          <h1 id={labelId} className="shrink-0 text-(length:--text-md) font-semibold">
            Compare
          </h1>
          <p className="min-w-0 flex-1 truncate text-(length:--text-sm) text-fg-muted">
            {a.label} <span aria-hidden="true">→</span>
            <span className="sr-only"> compared with </span> {b.label}
          </p>
          {onClose ? (
            <button type="button" aria-label="Close compare" className={chromeButton} onClick={onClose}>
              <X aria-hidden="true" size={18} />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <div role="group" aria-label="View" className="flex items-center gap-1">
            <button type="button" aria-pressed={!swipe} className={chromeTextButton} onClick={() => setMode("side")}>
              Side by side
            </button>
            <button type="button" aria-pressed={swipe} className={chromeTextButton} onClick={() => setMode("swipe")}>
              Swipe
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button type="button" aria-label="Previous frame" className={chromeButton} disabled={frames.length === 0 || frameIndex <= 0} onClick={() => goTo(frames[frameIndex <= 0 ? 0 : frameIndex - 1].id)}>
              <ChevronLeft aria-hidden="true" size={18} />
            </button>
            <label htmlFor={`${uid}-frame`} className="sr-only">
              Frame
            </label>
            <select id={`${uid}-frame`} className={control} value={frameId} disabled={frames.length === 0} onChange={(e) => goTo(e.target.value)}>
              <option value="">Whole board</option>
              {frames.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <button type="button" aria-label="Next frame" className={chromeButton} disabled={frames.length === 0 || frameIndex === frames.length - 1} onClick={() => goTo(frames[frameIndex + 1].id)}>
              <ChevronRight aria-hidden="true" size={18} />
            </button>
          </div>

          <label className="flex min-h-9 cursor-pointer items-center gap-2 text-(length:--text-sm) pointer-coarse:min-h-11">
            <input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} className="size-4 accent-(--color-accent)" />
            Highlight changes
          </label>
        </div>

        <div className="text-(length:--text-sm)" data-testid="compare-summary" aria-live="polite">
          {totals.total === 0 ? (
            <p className="text-fg-muted">No differences between {a.label} and {b.label}.</p>
          ) : (
            <>
              <p>
                {totals.added} added · {totals.changed} changed · {totals.removed} removed
                {compared.diff.truncated ? " (long lists are cut short; the counts are exact)" : ""}
              </p>
              {compared.removed.length > 0 ? (
                <p className="mt-1 text-fg-muted">
                  Removed: {compared.removed.join(", ")}
                  {totals.removed > compared.removed.length ? ` and ${totals.removed - compared.removed.length} more` : ""}
                </p>
              ) : null}
            </>
          )}
        </div>
      </header>

      {/* The outlines live in canvas space, so their width is divided by the zoom to stay visible when the board is zoomed out. */}
      <style data-compare-style="">{`[data-compare-diff="added"]{outline:calc(2px * var(--inv-zoom, 1)) solid var(--color-accent);outline-offset:calc(3px * var(--inv-zoom, 1))}[data-compare-diff="changed"]{outline:calc(2px * var(--inv-zoom, 1)) dashed var(--color-accent);outline-offset:calc(3px * var(--inv-zoom, 1))}[data-compare-diff="removed"]{outline:calc(2px * var(--inv-zoom, 1)) dashed var(--color-danger);outline-offset:calc(3px * var(--inv-zoom, 1))}`}</style>
      <div ref={stage} className="relative min-h-0 flex-1 overflow-hidden" data-compare-mode={mode}>
        <section ref={paneA} aria-label={`A: ${a.label}`} data-compare-side="a" style={paneStyle("a")} className="border-r border-line">
          {indexA ? <CanvasView ref={setHandleA} doc={a.doc} index={indexA} assets={assets} readOnly initialCamera={{ x: 0, y: 0, z: 1 }} cameraShortcuts={false} /> : null}
          <span className={`${chip} ${swipe ? "right-2" : "left-2"}`}>A · {a.label}</span>
        </section>
        <section ref={paneB} aria-label={`B: ${b.label}`} data-compare-side="b" style={paneStyle("b")}>
          {indexB ? <CanvasView ref={setHandleB} doc={b.doc} index={indexB} assets={assets} readOnly initialCamera={{ x: 0, y: 0, z: 1 }} cameraShortcuts={false} /> : null}
          <span className={`${chip} left-2`}>B · {b.label}</span>
        </section>

        {swipe ? (
          <div aria-hidden="true" data-compare-divider="" className="pointer-events-none absolute inset-y-0 z-20 w-0.5 -translate-x-1/2 bg-(--color-accent)" style={{ left: `${position}%` }} />
        ) : null}
        {swipe ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-4">
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={position}
              aria-label="Compare position"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={position}
              aria-valuetext={`${position}% shows ${b.label}, the rest shows ${a.label}`}
              onChange={(e) => setPosition(Number(e.target.value))}
              className="pointer-events-auto h-11 w-full max-w-md accent-(--color-accent)"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
