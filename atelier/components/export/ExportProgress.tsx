"use client";

import { useEffect, useRef, useState } from "react";
import { buttonSecondary } from "@/components/ui/controls";

/**
 * Progress of a running export: a progressbar (value and text label), a Cancel button, and a polite live region that
 * announces the percentage only at 25 % steps so a screen reader is not flooded.
 */
export function ExportProgress({ ratio, label, onCancel }: { ratio: number; label: string; onCancel(): void }) {
  const pct = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  const step = Math.floor(pct / 25) * 25;
  const [announced, setAnnounced] = useState(`Export started`);
  const last = useRef(-1);
  useEffect(() => {
    if (step !== last.current) {
      last.current = step;
      setAnnounced(step === 0 ? "Export started" : `Export ${step} percent`);
    }
  }, [step]);
  return (
    <div className="mt-5 flex flex-col gap-2" data-export-progress="">
      <div className="flex items-center justify-between gap-3 text-(length:--text-sm) text-fg-muted">
        <span>{label}</span>
        <span aria-hidden="true">{pct}%</span>
      </div>
      <div role="progressbar" aria-label="Export progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={`${label}, ${pct} percent`} className="h-2 w-full overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {announced}
      </p>
      <div className="flex justify-end">
        <button type="button" className={buttonSecondary} onClick={onCancel}>
          Cancel export
        </button>
      </div>
    </div>
  );
}
