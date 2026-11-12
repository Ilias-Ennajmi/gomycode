"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useEditor } from "@/components/editor/EditorContext";
import { useIsDesktop } from "@/components/panels/doc-hooks";
import type { SyncStatus } from "@/lib/sync/status";
import { ContextBar } from "./ContextBar";
import { ContextMenu } from "./ContextMenu";
import { useStoredFlag, useViewportWidth } from "./hooks";
import { Minimap } from "./Minimap";
import { StatusLive } from "./StatusLive";
import { Toolbar } from "./Toolbar";
import { TopBar, type TopBarProps } from "./TopBar";
import { ZoomControls } from "./ZoomControls";

/** Room between the docked panel and the window's right edge that the bottom-right controls step around. */
const PANEL_GAP = 24;
/** Narrower than this (after the panel), the zoom controls sit above the tools instead of beside them. */
const SIDE_BY_SIDE_MIN = 1044;

export type EditorChromeProps = Pick<TopBarProps, "boardId" | "title" | "onTitleChange" | "breadcrumb"> & {
  status: SyncStatus;
  localOnly: boolean;
  /**
   * An element placed before the canvas in the page. The top bar and the toolbar are rendered into it, so the keyboard
   * order is skip link, top bar, toolbar, canvas, then the selection bar and the zoom controls.
   */
  slot: HTMLElement | null;
};

/**
 * Everything around the canvas: top bar, toolbar, selection bar, context menu, zoom controls, minimap and the sync
 * live region. Render inside <EditorProvider>, next to <EditorOverlays />.
 */
export function EditorChrome({ boardId, title, onTitleChange, breadcrumb, status, localOnly, slot }: EditorChromeProps) {
  const { handle, panels } = useEditor();
  const desktop = useIsDesktop();
  const width = useViewportWidth();
  const [minimap, setMinimap] = useStoredFlag("atelier-minimap", true);
  const inset = desktop && panels.openId ? panels.width + PANEL_GAP : 0;
  const stacked = !desktop || width - inset < SIDE_BY_SIDE_MIN;
  const motion = !panels.instant;

  const skip = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    handle.container().id ||= "board-canvas";
  }, [handle]);

  const top = (
    <>
      <a
        ref={skip}
        href="#board-canvas"
        onClick={(e) => {
          e.preventDefault();
          handle.container().focus();
        }}
        className="fixed top-2 left-2 z-(--z-modal) -translate-y-16 rounded-md bg-brand px-4 py-2 text-(length:--text-sm) font-medium text-on-brand shadow-3 focus:translate-y-0"
      >
        Skip to canvas
      </a>
      <TopBar boardId={boardId} title={title} onTitleChange={onTitleChange} breadcrumb={breadcrumb} status={status} localOnly={localOnly} />
      <Toolbar insetRight={inset} instant={!motion} />
    </>
  );

  return (
    <>
      {slot ? createPortal(top, slot) : top}
      <ContextBar />
      <ContextMenu />
      <div
        data-zoom-dock=""
        className={`pointer-events-none fixed right-3 z-(--z-toolbar) flex flex-col items-end gap-2 ${motion ? "transition-transform duration-(--dur-base) ease-out" : ""} ${
          stacked ? "bottom-[calc(4.75rem+env(safe-area-inset-bottom))]" : "bottom-[max(var(--space-3),env(safe-area-inset-bottom))]"
        }`}
        style={{ transform: inset ? `translateX(${-inset}px)` : undefined }}
      >
        <div className="pointer-events-auto">
          <Minimap open={minimap} />
        </div>
        <div className="pointer-events-auto">
          <ZoomControls minimapOpen={minimap} onToggleMinimap={() => setMinimap(!minimap)} />
        </div>
      </div>
      <StatusLive status={status} localOnly={localOnly} />
    </>
  );
}
