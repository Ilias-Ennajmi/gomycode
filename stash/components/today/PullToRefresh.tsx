"use client";

import { useRef, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { cx } from "@/components/ui/cx";
import { haptic } from "@/lib/haptics";

const TRIGGER_PX = 72;

/** Pull down from the top of the page to refresh. Touch only; the visible Refresh button covers the rest. */
export function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<unknown>; children: ReactNode }) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const startY = useRef<number | null>(null);

  const end = () => {
    const ready = pull >= TRIGGER_PX;
    startY.current = null;
    setDragging(false);
    setPull(0);
    if (ready && !busy) {
      haptic();
      setBusy(true);
      void onRefresh().finally(() => setBusy(false));
    }
  };

  return (
    <div
      onTouchStart={(e) => {
        startY.current = window.scrollY <= 0 ? e.touches[0].clientY : null;
        setDragging(startY.current !== null);
      }}
      onTouchMove={(e) => {
        if (startY.current === null) return;
        const d = e.touches[0].clientY - startY.current;
        setPull(d > 0 ? Math.min(d * 0.5, TRIGGER_PX * 1.4) : 0);
      }}
      onTouchEnd={end}
      onTouchCancel={end}
    >
      <div
        aria-live="polite"
        className="flex items-center justify-center overflow-hidden text-caption text-fg-muted"
        style={{ height: busy ? "var(--space-8)" : pull, transition: dragging ? "none" : "height var(--dur-screen)" }}
      >
        {(pull > 8 || busy) && (
          <span className="flex items-center gap-2">
            <RefreshCw
              size={20}
              strokeWidth={2}
              aria-hidden
              className={cx(busy && "animate-spin")}
              style={busy ? undefined : { transform: `rotate(${pull * 3}deg)` }}
            />
            {busy ? "Rebuilding your queue…" : pull >= TRIGGER_PX ? "Release to rebuild" : "Pull to rebuild"}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
