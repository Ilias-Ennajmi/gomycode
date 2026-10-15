"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useChromeHidden } from "@/lib/hooks/useChrome";

/**
 * Wraps a bar so it slides shut while the list scrolls down and open again on the way
 * back up (phones only; on wider screens there's room, so it stays). The space it frees
 * goes to the list.
 */
export function ChromeCollapse({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const hidden = useChromeHidden();
  return (
    <div
      className={cn(
        "grid shrink-0 transition-[grid-template-rows] duration-200 ease-out md:!grid-rows-[1fr]",
        hidden ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
        className
      )}
      // Not focusable while shut, so keyboards and screen readers skip it.
      inert={hidden ? true : undefined}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
