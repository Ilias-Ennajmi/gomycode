import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/**
 * Phase 0 placeholder: the screen's empty state — one short line and one action
 * that teaches the main gesture. Real content arrives in later phases.
 */
export function Placeholder({
  icon: Icon,
  line,
  action,
  phase,
}: {
  icon: LucideIcon;
  line: string;
  action?: { label: string; href: string };
  phase: string;
}) {
  return (
    <section className="flex flex-col items-center gap-4 px-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-raised text-fg-muted" aria-hidden>
        <Icon size={24} strokeWidth={2} />
      </div>
      <p className="max-w-xs text-body text-fg">{line}</p>
      {action && (
        <Link
          href={action.href}
          className="tap flex items-center justify-center rounded-card border border-line px-6 text-label text-fg"
        >
          {action.label}
        </Link>
      )}
      <p className="text-caption text-fg-subtle">Coming in {phase}</p>
    </section>
  );
}
