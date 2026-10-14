import { cx } from "./cx";

export type ProgressSegmentsProps = {
  total: number;
  filled: number;
  /** Accent fill (Today header), otherwise the text colour. */
  accent?: boolean;
  /** For use on an accent surface: fills in the on-accent ink. */
  onAccent?: boolean;
  /** Accessible text, e.g. "3 of 5 this week". */
  label?: string;
  className?: string;
};

export function ProgressSegments({ total, filled, accent, onAccent, label, className }: ProgressSegmentsProps) {
  const done = Math.max(0, Math.min(total, filled));
  const fill = onAccent ? "bg-on-accent" : accent ? "bg-accent" : "bg-fg";
  const empty = onAccent ? "bg-on-accent/25" : "bg-line";
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-valuetext={label ?? `${done} of ${total}`}
      aria-label={label ?? "Progress"}
      className={cx("flex w-full gap-1", className)}
    >
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cx("h-1 flex-1 rounded-full", i < done ? fill : empty)} />
      ))}
    </div>
  );
}
