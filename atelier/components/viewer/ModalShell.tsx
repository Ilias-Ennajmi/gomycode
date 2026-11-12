"use client";

import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A modal dialog or bottom sheet: focus moves in when it opens and back to where it was when it closes, Tab stays inside,
 * Escape closes it (unless `dismissible` is false), and the page behind is hidden from assistive technology. It is plain
 * markup (not <dialog>) so toasts and the live region stay in the same stacking context.
 */
export function ModalShell({
  label,
  onClose,
  children,
  variant = "sheet",
  dismissible = true,
  className,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
  variant?: "sheet" | "full" | "center";
  dismissible?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const before = document.activeElement as HTMLElement | null;
    const first = root.querySelector<HTMLElement>("[data-autofocus]") ?? root.querySelector<HTMLElement>(FOCUSABLE) ?? root;
    first.focus({ preventScroll: true });

    // Everything else on the page is hidden from screen readers while this is open.
    const siblings = Array.from(root.parentElement?.children ?? []).filter((n) => n !== root && n instanceof HTMLElement && !n.hasAttribute("data-modal-layer")) as HTMLElement[];
    const prior = siblings.map((n) => n.getAttribute("aria-hidden"));
    siblings.forEach((n) => n.setAttribute("aria-hidden", "true"));
    siblings.forEach((n) => n.setAttribute("inert", ""));

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) {
        e.preventDefault();
        e.stopPropagation();
        close.current();
      } else if (e.key === "Tab") {
        const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
        if (items.length === 0) {
          e.preventDefault();
          return;
        }
        const a = items[0];
        const z = items[items.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === a || !root.contains(active))) {
          e.preventDefault();
          z.focus();
        } else if (!e.shiftKey && (active === z || !root.contains(active))) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      siblings.forEach((n, i) => {
        const p = prior[i];
        if (p === null) n.removeAttribute("aria-hidden");
        else n.setAttribute("aria-hidden", p);
        n.removeAttribute("inert");
      });
      if (before && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, [dismissible]);

  return (
    <div className={`vw-modal vw-modal-${variant}`} data-modal-layer="">
      {variant !== "full" ? <div className="vw-scrim" aria-hidden="true" onClick={dismissible ? onClose : undefined} /> : null}
      <div ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={`vw-modal-body ${className ?? ""}`}>
        {children}
      </div>
    </div>
  );
}
