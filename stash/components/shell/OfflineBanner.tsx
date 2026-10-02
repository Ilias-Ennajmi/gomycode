"use client";

import { WifiOff } from "lucide-react";
import { useOnline } from "@/lib/hooks/useOnline";

/** Small banner while offline; saving, cached saves and cached videos still work. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="sticky top-0 z-20 flex items-center justify-center gap-2 bg-raised px-4 py-2 pt-safe text-caption text-fg-muted">
      <WifiOff size={16} strokeWidth={2} aria-hidden />
      Offline. Saves will sync when you&rsquo;re back.
    </div>
  );
}
