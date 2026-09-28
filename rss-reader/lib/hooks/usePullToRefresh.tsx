"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/native";
import { refreshFeeds, refreshToastMessage } from "@/lib/hooks/useFeeds";

const PULL_TRIGGER = 64;
const PULL_MAX = 96;

/**
 * Pull down at the top of a scrolling list to fetch new articles, like native apps.
 * The listeners are passive, so normal scrolling is never held up.
 */
export function usePullToRefresh() {
  const { mutate } = useSWRConfig();
  // A callback ref, so lists that mount after a loading state still get the gesture.
  const [el, bind] = React.useState<HTMLElement | null>(null);
  const [pull, setPull] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const busy = React.useRef(false);

  const refresh = React.useCallback(async () => {
    busy.current = true;
    setRefreshing(true);
    try {
      const result = await refreshFeeds();
      mutate(() => true, undefined, { revalidate: true });
      toast.success(refreshToastMessage(result));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh feeds");
    } finally {
      busy.current = false;
      setRefreshing(false);
    }
  }, [mutate]);

  React.useEffect(() => {
    if (!el) return;
    const node = el;
    let startY: number | null = null;
    let distance = 0;

    function onStart(event: TouchEvent) {
      startY = node.scrollTop <= 0 && !busy.current ? event.touches[0].clientY : null;
      distance = 0;
    }
    function onMove(event: TouchEvent) {
      if (startY === null) return;
      const dy = event.touches[0].clientY - startY;
      const next = dy > 0 && node.scrollTop <= 0 ? Math.min(PULL_MAX, dy * 0.5) : 0;
      if (next >= PULL_TRIGGER !== distance >= PULL_TRIGGER) haptic();
      distance = next;
      setPull(next);
    }
    function onEnd() {
      if (startY === null) return;
      startY = null;
      const triggered = distance >= PULL_TRIGGER;
      distance = 0;
      setPull(0);
      if (triggered) void refresh();
    }
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [el, refresh]);

  return { bind, pull, refreshing };
}

/** Goes first inside the scrolling element; grows as you pull. */
export function PullIndicator({ pull, refreshing }: { pull: number; refreshing: boolean }) {
  const height = refreshing ? 44 : pull;
  if (!height) return null;
  return (
    <div
      className={cn(
        "flex items-end justify-center overflow-hidden md:hidden",
        !pull && "transition-[height] duration-200"
      )}
      style={{ height }}
      aria-hidden
    >
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full border bg-background shadow">
        <RefreshCw
          className={cn(
            "h-4 w-4",
            refreshing ? "animate-spin text-primary" : "text-muted-foreground",
            pull >= PULL_TRIGGER && "text-primary"
          )}
          style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)` }}
        />
      </div>
    </div>
  );
}
