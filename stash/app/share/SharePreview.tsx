"use client";

import { useSearchParams } from "next/navigation";
import { Link2 } from "lucide-react";

/** Shows what was shared, so the Android share flow can be tested end to end in Phase 0. */
export function SharePreview() {
  const params = useSearchParams();
  const shared = params.get("url") || params.get("text") || params.get("title") || "";
  return (
    <div className="fixed inset-0 flex items-end bg-scrim">
      <section
        role="dialog"
        aria-label="Save to Stash"
        className="w-full rounded-t-sheet bg-surface px-6 pt-6 pb-safe shadow-sheet"
      >
        <div className="flex flex-col gap-3 pb-8">
          <h1 className="text-title">Got it</h1>
          <div className="flex items-center gap-3 rounded-card bg-raised p-3 text-body text-fg-muted">
            <Link2 size={24} strokeWidth={2} aria-hidden className="shrink-0" />
            <span className="break-all">{shared || "Nothing was shared."}</span>
          </div>
          <p className="text-caption text-fg-subtle">Instant saving arrives in Phase 1. Swipe back to return.</p>
        </div>
      </section>
    </div>
  );
}
