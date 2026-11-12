"use client";

import { Layers, Map as MapIcon, Palette, Redo2, Search, SlidersHorizontal, Undo2 } from "lucide-react";
import { useRef, useState } from "react";
import { useEditor } from "@/components/editor/EditorContext";
import { useIsDesktop } from "@/components/panels/doc-hooks";
import { zoomAt } from "@/lib/engine/geometry/camera";
import { RovingToolbar } from "@/components/ui/RovingToolbar";
import { IconButton, chromeTextButton } from "./controls";
import { useUndoState, useZoom } from "./hooks";
import { MenuList, type MenuEntry } from "./Menu";
import { Popover } from "./Popover";
import { Tip } from "./Tip";
import { formatShortcut } from "@/lib/engine/commands/shortcuts";

const PRESETS = [0.25, 0.5, 1, 2] as const;

/**
 * Bottom-right: undo and redo, the zoom percentage (a menu of presets), the minimap switch and the Layers, Inspector
 * and Find buttons. Undo and redo use aria-disabled, so they stay focusable and keep their tooltip.
 */
export function ZoomControls({ minimapOpen, onToggleMinimap }: { minimapOpen: boolean; onToggleMinimap(): void }) {
  const { handle, registry, run, panels, commandCtx } = useEditor();
  const desktop = useIsDesktop(); // the minimap needs room: below 768 px it is neither drawn nor switchable
  const zoom = useZoom(handle);
  const { canUndo, canRedo } = useUndoState(handle.doc);
  const [open, setOpen] = useState(false);
  const zoomButton = useRef<HTMLButtonElement>(null);
  const percent = `${Math.round(zoom * 100)}%`;

  const setZoom = (z: number, animate: boolean) => {
    const vp = handle.viewport();
    const cam = handle.getCamera();
    handle.setCamera(zoomAt(cam, { x: vp.w / 2, y: vp.h / 2 }, z / cam.z), { animate });
  };

  const entries: MenuEntry[] = [
    ...PRESETS.map((z): MenuEntry => ({ type: "item", id: `z${z}`, label: `${z * 100}%`, checked: Math.abs(zoom - z) < 0.005, run: (o) => setZoom(z, o.animate) })),
    { type: "separator", id: "s1" },
    { type: "item", id: "fit", label: "Zoom to fit", shortcut: formatShortcut(registry.get("view.zoomFit").shortcut ?? ""), run: (o) => void run("view.zoomFit", { animate: o.animate }) },
    ...(registry.available("view.zoomSelection", commandCtx())
      ? ([{ type: "item", id: "sel", label: "Zoom to selection", shortcut: formatShortcut(registry.get("view.zoomSelection").shortcut ?? ""), run: (o) => void run("view.zoomSelection", { animate: o.animate }) }] as MenuEntry[])
      : []),
  ];

  return (
    <RovingToolbar label="View" className="flex items-center gap-0.5 rounded-lg border border-line bg-panel p-1 shadow-2">
      <IconButton
        label="Undo"
        icon={Undo2}
        shortcut="Mod+Z"
        aria-disabled={!canUndo || undefined}
        onClick={() => void run("edit.undo")}
      />
      <IconButton label="Redo" icon={Redo2} shortcut="Mod+Shift+Z" aria-disabled={!canRedo || undefined} onClick={() => void run("edit.redo")} />
      <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-line" />
      <Tip label="Zoom presets">
        <button
          ref={zoomButton}
          type="button"
          aria-label={`Zoom, ${percent}`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`${chromeTextButton} min-w-14 text-(length:--text-sm) font-medium tabular-nums`}
        >
          {percent}
        </button>
      </Tip>
      <Popover open={open} onClose={() => setOpen(false)} anchor={zoomButton} role="menu" label="Zoom" align="center" className="p-1">
        <MenuList entries={entries} onRun={() => setOpen(false)} />
      </Popover>
      {desktop ? (
        <>
          <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-line" />
          <IconButton label="Minimap" icon={MapIcon} pressed={minimapOpen} onClick={onToggleMinimap} />
        </>
      ) : null}
      <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-line" />
      <IconButton label="Layers" icon={Layers} pressed={panels.openId === "layers"} onClick={() => panels.toggle("layers")} />
      <IconButton label="Inspector" icon={SlidersHorizontal} pressed={panels.openId === "inspector"} onClick={() => panels.toggle("inspector")} />
      <IconButton label="Find and replace" icon={Search} shortcut="Mod+F" pressed={panels.openId === "find"} onClick={() => panels.toggle("find")} />
      <IconButton label="Palette" icon={Palette} pressed={panels.openId === "palette"} onClick={() => panels.toggle("palette")} />
    </RovingToolbar>
  );
}
