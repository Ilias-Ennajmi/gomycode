"use client";

import { useState, type ComponentProps } from "react";
import dynamic from "next/dynamic";
import { ArrowRight, Sparkles } from "lucide-react";
import { cx } from "@/components/ui/cx";

const Sheet = dynamic(() => import("./AskSheet").then((m) => m.AskSheet), { ssr: false });

type Props = ComponentProps<typeof Sheet>;

/** The Ask sheet, fetched the first time it opens (it stays mounted after, so it can close smoothly). */
export function AskSheet(props: Props) {
  const [wanted, setWanted] = useState(props.open);
  if (props.open && !wanted) setWanted(true);
  return wanted ? <Sheet {...props} /> : null;
}

/** The way in from Today: one row in the insight colour, because what comes back is written by the AI. */
export function AskRow({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={cx("press flex min-h-16 items-center gap-4 rounded-lg bg-surface p-4 text-left shadow-pop", className)}>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card bg-raised text-insight">
        <Sparkles size={24} strokeWidth={2} aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-heading text-fg">Ask your saves</span>
        <span className="text-caption text-fg-muted">A question in, an answer from what you saved</span>
      </span>
      <ArrowRight size={22} strokeWidth={2} aria-hidden className="shrink-0 text-fg-muted" />
    </button>
  );
}
