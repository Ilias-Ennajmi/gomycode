import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { cx } from "@/components/ui/cx";
import type { Platform } from "@/lib/links";
import { PROCESS_STEPS, aiNote, processIndex, processLabel, type ProcessStep } from "@/lib/playback";
import type { Enums } from "@/lib/supabase/types";

const DOING: Record<(typeof PROCESS_STEPS)[number], string> = {
  fetching: "Getting the title, the picture and the video",
  watching: "Listening to what is said",
  reading: "Writing the key idea and takeaways",
  filing: "Filing it so search can find it",
};

/** Live progress of a save that is still being processed: one line per step. */
export function ProcessSteps({ step, platform }: { step: ProcessStep | undefined; platform: Platform }) {
  const at = processIndex(step);
  return (
    <ol aria-label="Progress" className="flex flex-col gap-1 rounded-lg bg-surface p-3 shadow-pop">
      {PROCESS_STEPS.map((s, i) => {
        const n = i + 1;
        const done = n < at;
        const now = n === at;
        return (
          <li key={s} aria-current={now ? "step" : undefined} className={cx("flex min-h-11 items-center gap-3 rounded-card px-2", now && "bg-raised")}>
            <span
              className={cx(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-display text-caption",
                done ? "bg-fg text-background" : now ? "shimmer bg-raised text-fg ring-2 ring-fg" : "bg-raised text-fg-subtle",
              )}
            >
              {done ? <Check size={16} strokeWidth={3} aria-hidden /> : n}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className={cx("text-label", done || now ? "text-fg" : "text-fg-subtle")}>
                {processLabel(s, platform)}
                {done && <span className="sr-only"> (done)</span>}
              </span>
              {now && <span className="text-caption text-fg-muted">{s === "watching" && (platform === "web" || platform === "screenshot") ? "Reading what it says" : DOING[s]}</span>}
            </span>
          </li>
        );
      })}
      {at === 0 && <li className="px-2 pb-1 text-caption text-fg-muted">Waiting for its turn. This usually takes a few seconds.</li>}
    </ol>
  );
}

/** A ready save without a summary: one calm line on why, and where to look. */
export function AiStateNote({ aiState, onRetry }: { aiState: Enums<"ai_state"> | undefined; onRetry?: () => void }) {
  const note = aiNote(aiState);
  if (!note) return null;
  return (
    <p className="flex items-start gap-3 rounded-lg bg-surface p-4 text-body text-fg-muted shadow-pop">
      <Sparkles size={20} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0 text-insight" />
      <span className="min-w-0 flex-1">
        {note.text}{" "}
        {note.link && (
          <Link href={note.link.href} className="text-label text-fg underline">
            {note.link.label}
          </Link>
        )}
        {note.retry && onRetry && (
          <button type="button" onClick={onRetry} className="text-label text-fg underline">
            Try again
          </button>
        )}
      </span>
    </p>
  );
}
