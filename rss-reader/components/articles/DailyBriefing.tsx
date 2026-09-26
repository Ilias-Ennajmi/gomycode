"use client";

import * as React from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useAiStatus, useDigest } from "@/lib/hooks/useAi";

const COLLAPSED_KEY = "briefing-collapsed";

/** "Today's briefing" at the top of For You; hidden when AI is off. */
export function DailyBriefing({ onOpen }: { onOpen: (articleId: string) => void }) {
  const status = useAiStatus();
  const { digest, isLoading } = useDigest(Boolean(status?.enabled));
  const [collapsed, setCollapsed] = React.useState(false);

  // Collapsing hides today's briefing until tomorrow's arrives (per device).
  React.useEffect(() => {
    if (!digest) return;
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === digest.date);
    } catch {
      // Storage unavailable (private mode): just start expanded.
    }
  }, [digest]);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      if (next && digest) localStorage.setItem(COLLAPSED_KEY, digest.date);
      else localStorage.removeItem(COLLAPSED_KEY);
    } catch {
      // Ignore: the toggle still works for this visit.
    }
  }

  if (!status?.enabled || (!digest && !isLoading)) return null;

  return (
    <section className="border-b px-4 py-4">
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-4 shadow-sm">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          className="flex w-full items-center gap-2 text-left"
        >
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="flex-1">
            <span className="block tracking-tight text-lg font-semibold leading-tight">
              Today&rsquo;s briefing
            </span>
            {digest && (
              <span className="block text-xs text-muted-foreground">
                {new Date(`${digest.date}T12:00:00`).toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            )}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              collapsed && "-rotate-90"
            )}
          />
        </button>

        {!collapsed &&
          (digest ? (
            <div className="mt-3 space-y-3">
              {digest.intro && (
                <p className="text-[14px] leading-relaxed text-foreground/85">{digest.intro}</p>
              )}
              <ol className="space-y-1">
                {digest.items.map((item, i) => (
                  <li key={item.articleId}>
                    <button
                      type="button"
                      onClick={() => onOpen(item.articleId)}
                      className="flex w-full gap-3 rounded-lg px-2 py-2 text-left hover:bg-accent/60"
                    >
                      <span className="mt-0.5 tracking-tight text-base font-semibold text-primary">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block tracking-tight text-[15px] font-semibold leading-snug">
                          {item.headline}
                        </span>
                        {item.blurb && (
                          <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
                            {item.blurb}
                          </span>
                        )}
                        {item.sources.length > 1 && (
                          <span className="mt-1 block text-[11px] text-muted-foreground">
                            {item.sources.length} sources
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="mt-3 space-y-2" aria-label="Writing today's briefing">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-5/6" />
              <Skeleton className="h-3.5 w-2/3" />
            </div>
          ))}
      </div>
    </section>
  );
}
