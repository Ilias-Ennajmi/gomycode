import { Sparkles } from "lucide-react";
import { cx } from "./cx";

export type AiLabelProps = {
  /** e.g. "Pattern spotted" → "AI · Pattern spotted". */
  text: string;
  className?: string;
};

/** The AI marker. Insight orange is reserved for this and synthesis cards. */
export function AiLabel({ text, className }: AiLabelProps) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-label text-insight", className)}>
      <Sparkles size={20} strokeWidth={2} aria-hidden />
      <span>
        AI <span aria-hidden>·</span> {text}
      </span>
    </span>
  );
}
