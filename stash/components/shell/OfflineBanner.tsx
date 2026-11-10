"use client";

import { WifiOff } from "lucide-react";
import { useOnline } from "@/lib/hooks/useOnline";

/** Small banner while offline; saving, cached saves and cached videos still work. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="sticky top-0 z-20 flex items-center justify-center gap-2 bg-fg px-4 py-2 pt-safe text-label text-background">
      <WifiOff size={20} strokeWidth={2} aria-hidden />
      Offline. Saving and cached videos still work.
    </div>
  );
}
