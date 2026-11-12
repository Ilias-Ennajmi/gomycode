"use client";

import { useEffect, useRef, useState } from "react";
import { syncAnnouncement, type SyncStatus } from "@/lib/sync/status";

/**
 * A visually hidden polite live region for sync changes: going offline, a sync problem, and coming back. The routine
 * "saving, saved" cycle is silent (it would chatter after every edit), and the first status is never announced.
 * Copy, cut and delete are announced by the toast region, so they are not repeated here.
 */
export function StatusLive({ status, localOnly = false }: { status: SyncStatus; localOnly?: boolean }) {
  const [message, setMessage] = useState("");
  // The last status that was settled on: a "syncing" in between does not count.
  const settled = useRef<SyncStatus>(status);

  useEffect(() => {
    if (localOnly || status === "syncing") return;
    const text = syncAnnouncement(settled.current, status);
    settled.current = status;
    if (!text) return;
    // Clear first so the same words announced twice in a row are still read.
    setMessage("");
    const t = setTimeout(() => setMessage(text), 50);
    return () => clearTimeout(t);
  }, [status, localOnly]);

  return (
    <div role="status" aria-live="polite" aria-atomic="true" aria-label="Sync status" className="sr-only">
      {message}
    </div>
  );
}
