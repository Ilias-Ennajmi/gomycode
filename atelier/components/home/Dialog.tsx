"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A native modal <dialog>, mounted only while it is open. Mounting opens it (showModal: focus is
 * trapped, the page behind is inert), Escape and a click on the backdrop ask `onClose`, focus
 * goes to the first field (or the element marked data-autofocus) and returns to whatever had it
 * before. Without showModal (old browsers, jsdom) it falls back to the open attribute.
 */
export function Dialog({
  labelledBy,
  onClose,
  children,
  role = "dialog",
  describedBy,
  widthClass = "w-[min(28rem,calc(100vw-2rem))]",
}: {
  labelledBy: string;
  describedBy?: string;
  onClose: () => void;
  children: ReactNode;
  role?: "dialog" | "alertdialog";
  widthClass?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    const target =
      dialog.querySelector<HTMLElement>("[data-autofocus]") ??
      dialog.querySelector<HTMLElement>("input:not([type=radio]), select, textarea, button");
    target?.focus();
    return () => {
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      role={role}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={(e) => {
        e.preventDefault(); // we unmount instead, so state stays in one place
        closeRef.current();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          closeRef.current();
        }
      }}
      onMouseDown={(e) => {
        if (e.target === ref.current) closeRef.current(); // the backdrop is part of the dialog box
      }}
      className={`m-auto max-h-[calc(100dvh-2rem)] ${widthClass} overflow-y-auto rounded-lg bg-panel p-0 text-fg shadow-3 transition-[opacity,transform] duration-(--dur-base) ease-out backdrop:bg-(--color-scrim) starting:scale-[0.98] starting:opacity-0`}
    >
      <div className="p-6">{children}</div>
    </dialog>
  );
}
