"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isEditingSurface } from "@/components/canvas/useCanvasInput";
import { useEditor } from "@/components/editor/EditorContext";
import { screenToCanvas } from "@/lib/engine/geometry/camera";
import { pickObject } from "@/lib/engine/input/pick";
import { MenuList, type MenuEntry } from "./Menu";
import { contextMenuEntries } from "./menu-model";
import { Popover } from "./Popover";

/** A touch held this long (without moving) is a right-click. */
export const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP_PX = 10;

type Open = { x: number; y: number; entries: MenuEntry[]; instant: boolean; touch: boolean };
const TOUCH_OFFSET_PX = 16;
/** A finger lifting after a long press can land on the menu that just opened under it: clicks this soon are ignored. */
const RELEASE_GUARD_MS = 400;

/**
 * The canvas context menu: right-click, or a touch held for half a second. Everything in it is a registry command, so
 * it can never disagree with the shortcuts and the palette. Right-clicking an object selects it first (unless it is
 * already part of the selection); right-clicking the empty canvas clears the selection. Inside the text editor the
 * browser's own menu stays.
 */
export function ContextMenu() {
  const { handle, registry, commandCtx, run } = useEditor();
  const [menu, setMenu] = useState<Open | null>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  const openAt = useCallback(
    (clientX: number, clientY: number, opts: { touch?: boolean } = {}) => {
      const el = handle.container();
      const r = el.getBoundingClientRect();
      const point = screenToCanvas(handle.getCamera(), { x: clientX - r.left, y: clientY - r.top });
      const { doc, selection, index } = handle;
      const hit = pickObject({ doc, index, camera: () => handle.getCamera() }, point, { selected: selection.ids });
      if (hit) {
        if (!selection.has(hit.id)) selection.set([hit.id]);
      } else selection.clear();
      returnTo.current = el;
      const ctx = commandCtx();
      // Under a held finger the menu starts a little away from it, so lifting the finger cannot press the first item.
      const away = opts.touch ? TOUCH_OFFSET_PX : 0;
      setMenu({ x: clientX + away, y: clientY + away, entries: contextMenuEntries(registry, ctx, (id, o) => void run(id, o)), instant: false, touch: !!opts.touch });
    },
    [handle, registry, commandCtx, run],
  );

  useEffect(() => {
    const el = handle.container();
    let press: { id: number; x: number; y: number; timer: ReturnType<typeof setTimeout> } | null = null;
    const cancelPress = () => {
      if (press) clearTimeout(press.timer);
      press = null;
    };

    const onContext = (e: MouseEvent) => {
      if (isEditingSurface(e.target)) return;
      e.preventDefault();
      openAt(e.clientX, e.clientY);
    };
    const onDown = (e: PointerEvent) => {
      cancelPress();
      if (e.pointerType !== "touch" || !e.isPrimary || isEditingSurface(e.target)) return;
      const { pointerId, clientX: x, clientY: y } = e;
      press = {
        id: pointerId,
        x,
        y,
        timer: setTimeout(() => {
          press = null;
          // The canvas has been treating this touch as the start of a drag: abandon that gesture first.
          try {
            el.dispatchEvent(new PointerEvent("pointercancel", { pointerId, pointerType: "touch", bubbles: true }));
          } catch {
            /* no PointerEvent constructor: the gesture ends with the finger */
          }
          openAt(x, y, { touch: true });
        }, LONG_PRESS_MS),
      };
    };
    const onMove = (e: PointerEvent) => {
      if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > LONG_PRESS_SLOP_PX) cancelPress();
    };
    el.addEventListener("contextmenu", onContext);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", cancelPress);
    el.addEventListener("pointercancel", cancelPress);
    return () => {
      cancelPress();
      el.removeEventListener("contextmenu", onContext);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", cancelPress);
      el.removeEventListener("pointercancel", cancelPress);
    };
  }, [handle, openAt]);

  const close = useCallback(() => {
    setMenu(null);
    const back = returnTo.current;
    if (back?.isConnected) back.focus({ preventScroll: true });
  }, []);

  if (!menu) return null;
  return (
    <Popover open onClose={close} point={{ x: menu.x, y: menu.y }} role="menu" label="Canvas actions" instant={menu.instant} className="p-1">
      <MenuList entries={menu.entries} onRun={close} ignoreClicksMs={menu.touch ? RELEASE_GUARD_MS : 0} />
    </Popover>
  );
}
