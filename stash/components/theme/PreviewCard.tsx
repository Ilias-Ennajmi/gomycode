"use client";

import { Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SpaceChip } from "@/components/ui/SpaceChip";
import { cx } from "@/components/ui/cx";
import { SPACE_BG, type SpaceColor } from "@/components/ui/space";

const QUEUE: SpaceColor[] = ["violet", "teal", "amber", "blue", "rose"];

/** Live preview of the current appearance: a mini Today hero and a Space chip. Pure tokens, so it follows any data-theme. */
export function PreviewCard({ className }: { className?: string }) {
  return (
    // A picture of the current choices, not controls: inert keeps it out of focus order and TalkBack.
    <div inert className={cx("flex flex-col gap-3", className)}>
      <div className="rounded-xl bg-accent p-4 text-on-accent">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-display text-heading">Your 5 for today</p>
          <p className="text-caption">4 day streak</p>
        </div>
        <div className="mt-3 flex gap-2" aria-hidden>
          {QUEUE.map((c) => (
            <span key={c} className="relative aspect-9/16 flex-1 overflow-hidden rounded-sm bg-surface">
              {/* 3px Space top edge, see Card. */}
              <span className={cx("absolute inset-x-0 top-0 h-0.75", SPACE_BG[c])} />
            </span>
          ))}
        </div>
        <Button variant="on-accent" icon={Play} fullWidth className="mt-3">
          Start · 6 min
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SpaceChip name="Marketing" color="violet" count={12} />
        <SpaceChip name="Food" color="amber" suggested />
      </div>
    </div>
  );
}
