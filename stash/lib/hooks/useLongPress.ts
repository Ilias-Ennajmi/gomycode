"use client";

import { useCallback, useEffect, useRef } from "react";
import type { MouseEvent, PointerEvent } from "react";
import { haptic } from "@/lib/haptics";

type Options = {
  /** Hold time before firing, ms. */
  ms?: number;
  /** Movement (px) that cancels the press, so scrolling a chip row never fires it. */
  moveTolerance?: number;
};

/**
 * Long-press (500 ms pointer hold) as spreadable handlers. Right-click and the
 * keyboard context-menu key fire it too, so it is reachable without touch.
 * After a long press the following click is swallowed.
 */
export function useLongPress(onLongPress?: () => void, { ms = 500, moveTolerance = 10 }: Options = {}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cb = useRef(onLongPress);
  useEffect(() => {
    cb.current = onLongPress;
  });

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  }, []);

  useEffect(() => clear, [clear]);

  const fire = useCallback(() => {
    clear();
    fired.current = true;
    haptic();
    cb.current?.();
  }, [clear]);

  const enabled = Boolean(onLongPress);

  return {
    onPointerDown: (e: PointerEvent) => {
      if (!enabled || e.button !== 0) return;
      fired.current = false;
      origin.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(fire, ms);
    },
    onPointerMove: (e: PointerEvent) => {
      const o = origin.current;
      if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > moveTolerance) clear();
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: MouseEvent) => {
      if (!enabled) return;
      e.preventDefault();
      if (!fired.current) fire();
    },
    onClickCapture: (e: MouseEvent) => {
      if (fired.current) {
        fired.current = false;
        e.preventDefault();
        e.stopPropagation();
      }
    },
  };
}
