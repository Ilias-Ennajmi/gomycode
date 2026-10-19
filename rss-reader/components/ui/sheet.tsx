"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { useBackToClose } from "@/lib/hooks/useHistorySync";
import { keepOpenOnToast } from "@/components/ui/sonner";

/**
 * A bottom sheet, the way phones show menus: slides up from the bottom, a handle on top,
 * drag it down (or tap outside, or press back) to close. On wider screens it's centred.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  useBackToClose(open, () => onOpenChange(false));
  const [dy, setDy] = React.useState(0);
  const drag = React.useRef<number | null>(null);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          onInteractOutside={keepOpenOnToast}
          aria-describedby={undefined}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-2xl border bg-popover text-popover-foreground shadow-2xl outline-none",
            "data-[state=open]:animate-sheet-in sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
            className
          )}
          style={dy ? { transform: `translateY(${dy}px)`, transition: "none" } : undefined}
          onTouchStart={(event) => {
            if ((event.target as HTMLElement).closest("[data-scroll]")) return;
            drag.current = event.touches[0].clientY;
          }}
          onTouchMove={(event) => {
            if (drag.current === null) return;
            setDy(Math.max(0, event.touches[0].clientY - drag.current));
          }}
          onTouchEnd={() => {
            const moved = dy;
            drag.current = null;
            setDy(0);
            if (moved > 100) onOpenChange(false);
          }}
        >
          <span
            aria-hidden
            className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden"
          />
          {title ? (
            <DialogPrimitive.Title className="px-5 pb-1 pt-3 text-sm font-semibold">
              {title}
            </DialogPrimitive.Title>
          ) : (
            <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
          )}
          <div
            data-scroll
            className="min-h-0 flex-1 overflow-y-auto px-2 pb-safe pt-1 scrollbar-thin"
          >
            <div className="pb-3">{children}</div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export interface SheetAction {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  destructive?: boolean;
  checked?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/** A sheet of tappable rows, each closing the sheet when chosen. Sections are optional. */
export function ActionSheet({
  open,
  onOpenChange,
  title,
  sections,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  sections: { title?: React.ReactNode; actions: SheetAction[] }[];
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title}>
      {sections.map((section, i) => (
        <div key={i} className={cn(i > 0 && "mt-2 border-t pt-2")}>
          {section.title && (
            <p className="px-3 pb-1 pt-1 text-xs font-medium text-muted-foreground">
              {section.title}
            </p>
          )}
          {section.actions.map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={action.disabled}
              onClick={() => {
                onOpenChange(false);
                action.onSelect();
              }}
              className={cn(
                "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] transition-colors hover:bg-accent active:bg-accent disabled:opacity-50",
                action.destructive && "text-destructive",
                action.checked && "bg-primary/10 font-medium"
              )}
            >
              {action.icon && (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground [&>svg]:h-[18px] [&>svg]:w-[18px]">
                  {action.icon}
                </span>
              )}
              <span className="min-w-0 flex-1">{action.label}</span>
              {action.hint && (
                <span className="shrink-0 text-xs text-muted-foreground">{action.hint}</span>
              )}
            </button>
          ))}
        </div>
      ))}
    </Sheet>
  );
}

/** True on phone-sized screens, where menus become sheets. */
export function useIsPhone() {
  const [phone, setPhone] = React.useState(false);
  React.useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return phone;
}
