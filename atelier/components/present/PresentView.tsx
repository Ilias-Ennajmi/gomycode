"use client";

import { ChevronLeft, ChevronRight, CircleQuestionMark, Hand, Maximize, Minimize, MousePointer2, StickyNote, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import type { CanvasHandle } from "@/components/canvas/CanvasView";
import { chromeButton } from "@/components/chrome/controls";
import { canvasToScreen } from "@/lib/engine/geometry/camera";
import { PresentationController } from "@/lib/engine/present/controller";
import { slidesOfDoc } from "@/lib/engine/present/doc-slides";
import { cameraForSlide, slideAnnouncement } from "@/lib/engine/present/slides";
import { swipeDirection, tapZone } from "@/lib/engine/present/swipe";
import { LaserOverlay } from "./LaserOverlay";
import { NotesBar } from "./NotesBar";
import { PresentHelp } from "./PresentHelp";

const IDLE_MS = 3000;
const TAP_MAX_PX = 10;
const TAP_MAX_MS = 600;

const noop = () => {};

function fullscreenSupported(): boolean {
  return typeof document !== "undefined" && typeof document.documentElement.requestFullscreen === "function";
}

function enterFullscreen(): void {
  try {
    void Promise.resolve(document.documentElement.requestFullscreen?.()).catch(noop);
  } catch {
    /* the browser refused: present in the window */
  }
}

function leaveFullscreen(): void {
  try {
    if (document.fullscreenElement) void Promise.resolve(document.exitFullscreen?.()).catch(noop);
  } catch {
    /* already out */
  }
}

/** Is this key event for a control inside the presentation (a button the keyboard user tabbed to)? */
const onControl = (t: EventTarget | null): boolean => t instanceof Element && t.closest("[data-present-root] :is(button, a, input, select, textarea, summary)") !== null;

/**
 * Presentation mode: the frames of the board as slides, over the editor. The editor's own chrome is hidden by the
 * provider while this is mounted; the canvas underneath is read-only. Slide changes by keyboard never animate (SPEC §6:
 * keyboard-triggered actions do not animate); swipes, taps, the arrow buttons and the slide strip ease the camera in at
 * most 400 ms, and any input interrupts that. The deck is a snapshot taken on start: edits made on another device
 * meanwhile do not reshuffle it.
 */
export function PresentView({ handle, startAt = 0, onExit }: { handle: CanvasHandle; startAt?: number; onExit(): void }) {
  const [ctl] = useState(() => new PresentationController({ slides: slidesOfDoc(handle.doc), canvas: handle }));
  const state = useSyncExternalStore(ctl.subscribe.bind(ctl), () => ctl.state, () => ctl.state);
  const root = useRef<HTMLDivElement>(null);
  const exitRef = useRef(onExit);
  useEffect(() => {
    exitRef.current = onExit;
  });
  const [help, setHelp] = useState(false);
  const helpRef = useRef(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [awake, setAwake] = useState(true);
  const [tick, setTick] = useState(0);
  const [canFullscreen] = useState(() => fullscreenSupported());

  useEffect(() => {
    helpRef.current = help;
  }, [help]);

  // Start: the canvas becomes read-only, the selection is set aside, the first slide is framed.
  useEffect(() => {
    const doc = handle.doc;
    const selection = [...handle.selection.ids];
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    handle.selection.clear();
    handle.setReadOnly(true);
    if (!ctl.start(startAt)) {
      exitRef.current();
    } else {
      root.current?.focus({ preventScroll: true });
      if (canFullscreen) enterFullscreen();
    }
    return () => {
      ctl.exit();
      handle.setReadOnly(false);
      handle.selection.set(selection.filter((id) => !!doc.get(id)));
      leaveFullscreen();
      if (focused?.isConnected) focused.focus({ preventScroll: true });
    };
  }, [ctl, handle, startAt, canFullscreen]);

  // The viewport changed (resize, rotation, entering or leaving full screen): frame the slide again.
  useEffect(() => {
    const refit = () => {
      ctl.refit();
      setTick((t) => t + 1);
    };
    const el = handle.container();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(refit) : null;
    ro?.observe(el);
    window.addEventListener("resize", refit);
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", refit);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, [ctl, handle]);

  // The controls fade away after a few idle seconds and come back with any movement, touch or key.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wake = () => {
      setAwake(true);
      clearTimeout(timer);
      timer = setTimeout(() => setAwake(false), IDLE_MS);
    };
    wake();
    window.addEventListener("pointermove", wake, { passive: true });
    window.addEventListener("pointerdown", wake, { passive: true });
    window.addEventListener("keydown", wake, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, []);

  // The presentation owns the keyboard (capture phase on window: the editor's shortcuts never run underneath).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.isComposing) return;
      if (e.ctrlKey || e.metaKey || e.altKey) {
        // Browser shortcuts (zoom, copy, reload) keep working; the editor's do not. Select all would only paint the page.
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") e.preventDefault();
        return;
      }
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (helpRef.current) {
        if (k === "Escape" || k === "?") {
          e.preventDefault();
          setHelp(false);
        } else if (k !== "Tab") e.preventDefault();
        return;
      }
      const handled = (fn: () => void) => {
        e.preventDefault();
        fn();
      };
      switch (k) {
        case "ArrowRight":
        case "PageDown":
          return handled(() => ctl.next());
        case "ArrowLeft":
        case "PageUp":
          return handled(() => ctl.prev());
        case " ":
          if (onControl(e.target)) return; // Space presses the focused button
          return handled(() => (e.shiftKey ? ctl.prev() : ctl.next()));
        case "Home":
          return handled(() => ctl.first());
        case "End":
          return handled(() => ctl.last());
        case "Escape":
          return handled(() => exitRef.current());
        case "n":
          return handled(() => ctl.toggleNotes());
        case "l":
          return handled(() => ctl.toggleLaser());
        case "u":
          return handled(() => ctl.toggleUi());
        case "f":
          if (canFullscreen) return handled(() => (document.fullscreenElement ? leaveFullscreen() : enterFullscreen()));
          return;
        case "?":
          return handled(() => setHelp(true));
        default:
          if (/^[1-9]$/.test(k) && Number(k) <= ctl.state.count) handled(() => ctl.goTo(Number(k) - 1));
      }
    };
    // Nothing is pasted, cut or dropped into the board while it is on show.
    const block = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown, true);
    for (const t of ["paste", "cut", "drop", "dragover"]) window.addEventListener(t, block, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      for (const t of ["paste", "cut", "drop", "dragover"]) window.removeEventListener(t, block, true);
    };
  }, [ctl, canFullscreen]);

  // Swipe and tap on the slide (one finger or the mouse). A second finger cancels: that is a pinch, not a slide change.
  const gesture = useRef<{ id: number; x: number; y: number; t: number; multi: boolean } | null>(null);
  const down = useRef(new Set<number>());
  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    down.current.add(e.pointerId);
    if (gesture.current) {
      gesture.current.multi = true;
      return;
    }
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), multi: false };
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* the pointer is already gone */
    }
  }, []);
  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      down.current.delete(e.pointerId);
      const g = gesture.current;
      if (!g) return;
      if (down.current.size === 0) gesture.current = null;
      if (g.multi || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      const dt = performance.now() - g.t;
      const dir = swipeDirection(dx, dy, dt);
      if (dir === "next") ctl.next({ animate: true });
      else if (dir === "prev") ctl.prev({ animate: true });
      else if (Math.hypot(dx, dy) <= TAP_MAX_PX && dt <= TAP_MAX_MS) {
        const r = e.currentTarget.getBoundingClientRect();
        if (tapZone(e.clientX - r.left, r.width) === "prev") ctl.prev({ animate: true });
        else ctl.next({ animate: true });
      }
    },
    [ctl],
  );
  const onPointerCancel = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    down.current.delete(e.pointerId);
    if (down.current.size === 0) gesture.current = null;
  }, []);

  const slide = ctl.deck[state.index];
  const count = state.count;
  // Where the slide sits on screen at rest: the letterbox window. Read at render; `tick` re-renders on resize.
  const vp = handle.viewport();
  void tick;
  const window_ = useMemo(() => {
    if (!slide) return null;
    const r = canvasToScreen(cameraForSlide(slide, vp), { x: slide.rect.x, y: slide.rect.y });
    const z = cameraForSlide(slide, vp).z;
    return { left: r.x, top: r.y, width: slide.rect.w * z, height: slide.rect.h * z };
  }, [slide, vp.w, vp.h]); // eslint-disable-line react-hooks/exhaustive-deps

  const iconBtn = `${chromeButton} disabled:opacity-40`;

  return (
    <div
      ref={root}
      role="region"
      aria-label="Presentation"
      tabIndex={-1}
      data-present-root=""
      data-slide-index={state.index}
      data-slide-count={count}
      data-free-roam={state.freeRoam ? "true" : undefined}
      data-ui-hidden={state.uiHidden ? "true" : undefined}
      className="pointer-events-none fixed inset-0 z-(--z-present) overflow-hidden outline-none select-none"
    >
      {/* Frame name labels and the top bar and toolbar (portalled into the chrome slot) are editor chrome: not shown to an audience. */}
      <style data-present-style="">{"[data-frame-label],[data-chrome-slot]{display:none !important}"}</style>

      {state.freeRoam || !window_ ? null : (
        <div
          data-testid="present-window"
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{ left: window_.left, top: window_.top, width: window_.width, height: window_.height, boxShadow: "0 0 0 100vmax var(--color-present-bg)" }}
        />
      )}

      {state.freeRoam ? null : (
        <div
          data-testid="present-surface"
          className="pointer-events-auto absolute inset-0"
          style={{ touchAction: "none", cursor: state.laser ? "none" : undefined }}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        />
      )}

      {state.laser ? <LaserOverlay /> : null}

      <p role="status" aria-live="polite" className="sr-only">
        {slide ? slideAnnouncement(state.index, count, slide.name) : ""}
      </p>

      {state.notesOpen && slide && !state.uiHidden ? <NotesBar notes={slide.notes} slideName={slide.name} /> : null}

      <div className={`${state.uiHidden ? "invisible" : ""} transition-opacity duration-(--dur-base) ease-out ${awake || help ? "" : "opacity-0 focus-within:opacity-100"}`}>
        <div className="pointer-events-auto absolute top-3 right-3 flex items-center gap-1 rounded-lg border border-line bg-panel p-1 shadow-2">
          <button type="button" aria-label="Presenter notes (N)" title="Presenter notes (N)" aria-pressed={state.notesOpen} onClick={() => ctl.toggleNotes()} className={iconBtn}>
            <StickyNote aria-hidden="true" size={18} strokeWidth={1.75} />
          </button>
          <button type="button" aria-label="Laser pointer (L)" title="Laser pointer (L)" aria-pressed={state.laser} onClick={() => ctl.toggleLaser()} className={iconBtn}>
            <MousePointer2 aria-hidden="true" size={18} strokeWidth={1.75} />
          </button>
          <button type="button" aria-label="Free roam (pan and zoom the board)" title="Free roam (pan and zoom the board)" aria-pressed={state.freeRoam} onClick={() => ctl.toggleFreeRoam()} className={iconBtn}>
            <Hand aria-hidden="true" size={18} strokeWidth={1.75} />
          </button>
          {canFullscreen ? (
            <button
              type="button"
              aria-label={fullscreen ? "Leave full screen (F)" : "Full screen (F)"}
              title={fullscreen ? "Leave full screen (F)" : "Full screen (F)"}
              onClick={() => (document.fullscreenElement ? leaveFullscreen() : enterFullscreen())}
              className={iconBtn}
            >
              {fullscreen ? <Minimize aria-hidden="true" size={18} strokeWidth={1.75} /> : <Maximize aria-hidden="true" size={18} strokeWidth={1.75} />}
            </button>
          ) : null}
          <button type="button" aria-label="Shortcuts (?)" title="Shortcuts (?)" onClick={() => setHelp(true)} className={iconBtn}>
            <CircleQuestionMark aria-hidden="true" size={18} strokeWidth={1.75} />
          </button>
          <button type="button" aria-label="Exit presentation" title="Exit presentation (Esc)" onClick={() => exitRef.current()} className={iconBtn}>
            <X aria-hidden="true" size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="pointer-events-auto absolute bottom-3 left-1/2 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-1 rounded-lg border border-line bg-panel p-1 shadow-2">
          <button
            type="button"
            aria-label="Previous slide"
            title="Previous slide"
            disabled={state.index === 0}
            onClick={(e) => ctl.prev({ animate: e.detail > 0 })}
            className={iconBtn}
          >
            <ChevronLeft aria-hidden="true" size={20} strokeWidth={1.75} />
          </button>
          <span aria-hidden="true" className="min-w-14 px-1 text-center text-(length:--text-sm) font-medium text-fg tabular-nums">
            {state.index + 1} / {count}
          </span>
          <button
            type="button"
            aria-label="Next slide"
            title="Next slide"
            disabled={state.index >= count - 1}
            onClick={(e) => ctl.next({ animate: e.detail > 0 })}
            className={iconBtn}
          >
            <ChevronRight aria-hidden="true" size={20} strokeWidth={1.75} />
          </button>
          {count > 1 ? (
            <ol aria-label="Slides" className="m-0 ml-1 hidden max-w-[40vw] list-none items-center gap-1 overflow-x-auto border-l border-line p-0 pl-2 md:flex">
              {ctl.deck.map((s) => (
                <li key={s.id} className="flex">
                  <button
                    type="button"
                    aria-label={`Go to slide ${s.index + 1}: ${s.name}`}
                    title={s.name}
                    aria-current={s.index === state.index ? "step" : undefined}
                    onClick={(e) => ctl.goTo(s.index, { animate: e.detail > 0 })}
                    className="inline-flex h-7 min-w-7 items-center justify-center rounded-sm px-1.5 text-(length:--text-xs) font-medium text-fg-muted tabular-nums aria-[current=step]:bg-brand aria-[current=step]:text-on-brand hoverable:bg-(--color-selection-fill)"
                  >
                    {s.index + 1}
                  </button>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </div>

      {help ? <PresentHelp onClose={() => setHelp(false)} /> : null}
    </div>
  );
}
