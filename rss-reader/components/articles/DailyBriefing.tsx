"use client";

import { ChevronRight, Sunrise } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useBriefing } from "@/lib/hooks/useAi";
import { useReaderState } from "@/lib/hooks/useReaderState";

/** A compact entry to the Today briefing at the top of For You. */
export function DailyBriefing() {
  const { briefing, isLoading } = useBriefing(true);
  const { setView } = useReaderState();

  if (!briefing && !isLoading) return null;

  const minutes = briefing ? Math.max(3, Math.round(briefing.top.length * 0.7 + 1)) : 0;

  return (
    <section className="border-b px-3 py-3">
      <button
        type="button"
        onClick={() => setView({ type: "briefing", label: "Today's briefing" })}
        className="group flex w-full items-center gap-3 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-3.5 text-left shadow-sm transition-colors hover:border-primary/40"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Sunrise className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold leading-tight tracking-tight">
            Today&rsquo;s briefing
          </span>
          {briefing ? (
            <>
              <span className="block text-xs text-muted-foreground">
                {briefing.top.length} top stories · {minutes} min read
              </span>
              <span className="mt-1 block truncate text-[13px] text-foreground/80">
                {briefing.top
                  .slice(0, 2)
                  .map((s) => s.headline)
                  .join(" · ")}
              </span>
            </>
          ) : (
            <span className="mt-1 block space-y-1.5" aria-label="Writing today's briefing">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </span>
          )}
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </button>
    </section>
  );
}
