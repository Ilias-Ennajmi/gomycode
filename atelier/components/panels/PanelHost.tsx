"use client";

import { Layers, Search, SlidersHorizontal, X, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { PANEL_MAX_WIDTH, PANEL_MIN_WIDTH, useEditor } from "@/components/editor/EditorContext";
import { useIsDesktop } from "./doc-hooks";
import { FindReplace } from "./FindReplace";
import { InspectorPanel } from "./InspectorPanel";
import { LayersPanel } from "./LayersPanel";

export type PanelDef = { id: string; title: string; icon: LucideIcon; render(): ReactNode };

export const DEFAULT_PANELS: PanelDef[] = [
  { id: "layers", title: "Layers", icon: Layers, render: () => <LayersPanel /> },
  { id: "inspector", title: "Inspector", icon: SlidersHorizontal, render: () => <InspectorPanel /> },
  { id: "find", title: "Find and replace", icon: Search, render: () => <FindReplace /> },
];

const KEY_STEP = 16;

/**
 * The right-hand panel: one at a time (Layers, Inspector, Find and replace, ...), 260 to 420 px wide and resizable on
 * screens 768 px and wider, a bottom sheet below that. Opening moves focus into the panel; Escape or the close button
 * closes it and gives focus back to what had it (or the canvas). Opened from the keyboard it appears without animating.
 */
export function PanelHost({ panels = DEFAULT_PANELS }: { panels?: PanelDef[] }) {
  const { panels: state, handle } = useEditor();
  const desktop = useIsDesktop();
  const headingId = useId();
  const drag = useDragWidth(state.width, state.setWidth);
  const section = useRef<HTMLElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const previous = useRef<string | null>(null);
  const openId = state.openId;
  const def = panels.find((p) => p.id === openId) ?? null;
  const activeId = def?.id ?? null;

  // Focus: into the panel when it opens (or switches), back out when it closes.
  useEffect(() => {
    if (activeId && !previous.current) {
      opener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    }
    if (activeId) {
      const el = section.current;
      const target =
        el?.querySelector<HTMLElement>("[data-autofocus], input:not(:disabled)") ?? el;
      if (target && !el?.contains(document.activeElement)) target.focus({ preventScroll: true });
      else if (target && document.activeElement === el) target.focus({ preventScroll: true });
    } else if (previous.current) {
      const back = opener.current;
      if (back?.isConnected) back.focus({ preventScroll: true });
      else handle.container().focus({ preventScroll: true });
      opener.current = null;
    }
    previous.current = activeId;
  }, [activeId, handle]);

  if (!def) return null;
  const Icon = def.icon;
  const animate = !state.instant;

  const onKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape" && !e.defaultPrevented) {
      e.preventDefault();
      e.stopPropagation();
      state.close();
    }
  };

  return (
    <aside
      ref={section}
      key={def.id}
      aria-labelledby={headingId}
      data-presentation={desktop ? "dock" : "sheet"}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      style={desktop ? { width: state.width } : undefined}
      className={`fixed z-(--z-panel) flex min-h-0 flex-col border border-line bg-panel text-fg shadow-2 outline-none ${
        desktop
          ? "top-16 right-3 bottom-3 rounded-lg"
          : "inset-x-0 bottom-0 h-[min(70dvh,32rem)] rounded-t-lg pb-[env(safe-area-inset-bottom)]"
      } ${
        animate
          ? desktop
            ? "transition-[opacity,transform] duration-(--dur-base) ease-out starting:translate-x-2 starting:opacity-0"
            : "transition-transform duration-(--dur-slow) ease-out starting:translate-y-full"
          : ""
      }`}
    >
      {desktop ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panel"
          aria-valuemin={PANEL_MIN_WIDTH}
          aria-valuemax={PANEL_MAX_WIDTH}
          aria-valuenow={state.width}
          tabIndex={0}
          {...drag}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") state.setWidth(state.width + KEY_STEP);
            else if (e.key === "ArrowRight") state.setWidth(state.width - KEY_STEP);
            else if (e.key === "Home") state.setWidth(PANEL_MIN_WIDTH);
            else if (e.key === "End") state.setWidth(PANEL_MAX_WIDTH);
            else return;
            e.preventDefault();
            e.stopPropagation();
          }}
          className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize touch-none rounded-sm hoverable:bg-(--color-selection-fill) focus-visible:bg-(--color-selection-fill)"
        />
      ) : (
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-sm bg-line" />
      )}
      <header className="flex shrink-0 items-center gap-2 border-b border-line py-1 pr-1 pl-4">
        <Icon aria-hidden="true" size={16} className="text-fg-muted" />
        <h2 id={headingId} className="min-w-0 flex-1 truncate text-(length:--text-sm) font-semibold">
          {def.title}
        </h2>
        <button
          type="button"
          aria-label={`Close ${def.title}`}
          onClick={() => state.close()}
          className="inline-flex size-(--target-min) items-center justify-center rounded-sm text-fg-muted transition-[transform,background-color] duration-(--dur-fast) ease-out active:scale-[0.97] hoverable:bg-(--color-selection-fill) hoverable:text-fg"
        >
          <X aria-hidden="true" size={16} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{def.render()}</div>
    </aside>
  );
}

/** Pointer handlers that resize a right-docked panel by dragging its left edge. */
function useDragWidth(width: number, setWidth: (px: number) => void) {
  const start = useRef<{ x: number; width: number } | null>(null);
  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      start.current = { x: e.clientX, width };
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      if (!start.current) return;
      setWidth(start.current.width + (start.current.x - e.clientX));
    },
    onPointerUp(e: PointerEvent<HTMLElement>) {
      start.current = null;
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    },
    onPointerCancel() {
      start.current = null;
    },
  };
}
