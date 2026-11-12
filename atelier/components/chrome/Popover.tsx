"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { boxOf, placeFloating, type Placed, type Placement } from "./place";

export type PopoverProps = {
  open: boolean;
  /** Called for Escape, a press outside, or focus leaving the popover. */
  onClose(): void;
  /** The element it hangs from (a toolbar button); or a point, for a context menu. */
  anchor?: RefObject<HTMLElement | null>;
  point?: { x: number; y: number } | null;
  /** Side it prefers; it flips when the viewport has no room. */
  placement?: Placement;
  align?: "center" | "start" | "end";
  /** Accessible name. */
  label: string;
  role?: "dialog" | "menu" | "group";
  /** Skip the open animation (keyboard-triggered). */
  instant?: boolean;
  /** Move focus into the popover on open. Default true. */
  focusInside?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

/** Height of the floating top bar plus its margin: anchored popovers stay below it. */
const TOP_CHROME_PX = 64;

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * A floating panel next to its anchor. Placed in JS (see placeFloating: it flips and clamps to the viewport, so it can
 * never be clipped), portalled to <body> so no parent's overflow or transform can trap it. Escape closes it and gives
 * focus back to the anchor; a press outside, or focus moving out, closes it. Focus moves in when it opens.
 */
export function Popover(props: PopoverProps) {
  // Mounted only while open, so every opening starts unplaced (hidden) and is measured before it is painted.
  return props.open ? <PopoverBody {...props} /> : null;
}

function PopoverBody({
  onClose,
  anchor,
  point,
  placement = "top",
  align = "center",
  label,
  role = "dialog",
  instant = false,
  focusInside = true,
  className = "",
  style,
  children,
}: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const a = point
      ? { left: point.x, top: point.y, width: 0, height: 0 }
      : anchor?.current
        ? boxOf(anchor.current.getBoundingClientRect())
        : null;
    if (!a) return;
    const size = { width: el.offsetWidth, height: el.offsetHeight };
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const viewport = { width: vv?.width || window.innerWidth, height: vv?.height || window.innerHeight };
    setPlaced((cur) => {
      // Anchored popovers keep clear of the top bar; a context menu may go anywhere the pointer is.
      const next = placeFloating(a, size, viewport, point ? { prefer: "bottom", align: "start", gap: 0 } : { prefer: placement, align, marginTop: TOP_CHROME_PX });
      return cur && cur.left === next.left && cur.top === next.top && cur.placement === next.placement && cur.originX === next.originX ? cur : next;
    });
  }, [anchor, point, placement, align]);

  useLayoutEffect(() => {
    measure();
    const el = ref.current;
    const ro = typeof ResizeObserver !== "undefined" && el ? new ResizeObserver(measure) : null;
    if (el) ro?.observe(el);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure]);

  // Focus in once it is placed (an element that is still hidden cannot take focus).
  const ready = placed !== null;
  useEffect(() => {
    if (!ready || !focusInside) return;
    const el = ref.current;
    if (!el) return;
    const target = el.querySelector<HTMLElement>('[aria-checked="true"], [aria-pressed="true"], [data-autofocus]') ?? el.querySelector<HTMLElement>(FOCUSABLE) ?? el;
    target.focus({ preventScroll: true });
  }, [ready, focusInside]);

  // A press outside closes it (a press on the anchor is the anchor's own toggle).
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t || ref.current?.contains(t) || anchor?.current?.contains(t)) return;
      closeRef.current();
    };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, [anchor]);

  if (typeof document === "undefined") return null;

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // Escape closes any popover; Tab leaves a menu (menus do not trap focus and do not wait for it to wander off).
    if ((e.key === "Escape" || (e.key === "Tab" && role === "menu")) && !e.defaultPrevented) {
      e.preventDefault();
      e.stopPropagation();
      closeRef.current();
      anchor?.current?.focus({ preventScroll: true });
    }
  };
  const onBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    // A menu opened by a long press sees the browser's own follow-up events move focus to the canvas as the finger
    // lifts: menus close on Escape, Tab and a press outside instead.
    if (role === "menu") return;
    const next = e.relatedTarget as Node | null;
    if (!next) return; // focus went to the page or the window: a press outside handles that
    if (ref.current?.contains(next) || anchor?.current?.contains(next)) return;
    closeRef.current();
  };

  return createPortal(
    <div
      ref={ref}
      role={role}
      aria-label={label}
      data-popover=""
      data-placement={placed?.placement}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      style={{
        position: "fixed",
        left: placed?.left ?? 0,
        top: placed?.top ?? 0,
        visibility: placed ? "visible" : "hidden",
        transformOrigin: placed ? `${placed.originX}px ${placed.placement === "top" ? "100%" : "0"}` : undefined,
        ...style,
      }}
      className={`z-(--z-menu) max-w-[calc(100vw-1rem)] rounded-md border border-line bg-panel p-2 text-(length:--text-sm) text-fg shadow-2 outline-none ${
        instant ? "" : "transition-[opacity,transform] duration-(--dur-fast) ease-out starting:scale-95 starting:opacity-0"
      } ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}
