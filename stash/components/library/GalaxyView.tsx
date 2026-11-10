"use client";

import { Orbit } from "lucide-react";

/** Galaxy lens placeholder: saves as dots clustered by meaning arrive in Phase 4. */
export function GalaxyView() {
  return (
    <section aria-label="Galaxy" className="flex flex-col items-center gap-4 px-6 py-12 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-raised text-fg-muted">
        <Orbit size={24} strokeWidth={2} aria-hidden />
      </span>
      <h2 className="text-heading">Galaxy is coming soon</h2>
      <p className="max-w-xs text-body text-fg-muted">
        Your saves as stars, grouped by what they mean. Until then, Grid and Map show everything.
      </p>
    </section>
  );
}
