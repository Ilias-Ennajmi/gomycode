"use client";

import * as React from "react";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReadingGoal } from "@/lib/hooks/useReadingGoal";
import { useReaderState } from "@/lib/hooks/useReaderState";
import { haptic } from "@/lib/native";

/**
 * Today's reading as a ring that fills toward the daily goal, with the streak under it.
 * Tapping opens the stats page. The ring closes with a little pulse the first time the
 * goal is reached in a session.
 */
export function GoalRing({ size = 56, className }: { size?: number; className?: string }) {
  const { goal, minutes, progress, done, streak, loaded } = useReadingGoal();
  const { setView } = useReaderState();
  const [celebrate, setCelebrate] = React.useState(false);
  const wasDone = React.useRef<boolean | null>(null);
  React.useEffect(() => {
    if (!loaded) return;
    if (wasDone.current === false && done) {
      setCelebrate(true);
      haptic("done");
      const t = setTimeout(() => setCelebrate(false), 1200);
      return () => clearTimeout(t);
    }
    wasDone.current = done;
  }, [done, loaded]);

  const stroke = Math.max(4, Math.round(size / 11));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <button
      type="button"
      onClick={() => setView({ type: "stats", label: "Your reading" })}
      className={cn("group flex shrink-0 flex-col items-center gap-0.5", className)}
      aria-label={`${minutes} of ${goal} minutes read today${streak > 1 ? `, ${streak}-day streak` : ""}`}
      title="Your reading"
    >
      <span
        className={cn("relative block", celebrate && "animate-pop")}
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-muted"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - (loaded ? progress : 0))}
            className={cn(
              "transition-[stroke-dashoffset] duration-700 ease-out",
              done ? "stroke-emerald-500" : "stroke-primary"
            )}
          />
        </svg>
        <span
          className={cn(
            "absolute inset-0 flex flex-col items-center justify-center leading-none",
            done ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
          )}
        >
          <span className="text-[13px] font-bold tabular-nums">{minutes}</span>
          <span className="text-[8px] font-medium uppercase tracking-wide text-muted-foreground">
            min
          </span>
        </span>
      </span>
      {streak > 1 && (
        <span className="flex items-center gap-0.5 text-[10px] font-semibold text-orange-500">
          <Flame className="h-3 w-3" /> {streak}
        </span>
      )}
    </button>
  );
}
