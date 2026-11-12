/** What the editor shows about saving: "saved" (on the server too), "syncing", "offline" or "error" (server refused or broke). */
export type SyncStatus = "saved" | "syncing" | "offline" | "error";

/**
 * Plain-words label for the status line / live region. Offline and error both say the edit is safe on this device
 * (every edit is in IndexedDB before any network call), without alarming the user (SPEC §9: no modal interruptions).
 */
export function statusLabel(status: SyncStatus): string {
  switch (status) {
    case "saved":
      return "Saved";
    case "syncing":
      return "Saving…";
    case "offline":
      return "Saved on this device";
    case "error":
      return "Saved on this device. Sync is having trouble";
  }
}

/**
 * The words in the top bar (SPEC §6). Local-only boards have no server to be "saved" to: they say where they live.
 * `statusLabel` above stays the short form for places with little room.
 */
export function syncStatusText(status: SyncStatus, localOnly = false): string {
  if (localOnly) return "Saved on this device";
  switch (status) {
    case "saved":
      return "Saved";
    case "syncing":
      return "Syncing…";
    case "offline":
      return "Offline · saved on this device";
    case "error":
      return "Sync problem · saved on this device";
  }
}

/** What the screen-reader live region says when the status changes; null = stay silent (the routine saving cycle). */
export function syncAnnouncement(prev: SyncStatus, next: SyncStatus): string | null {
  if (next === "syncing" || prev === next) return null;
  if (next === "offline") return "Offline. Changes are saved on this device.";
  if (next === "error") return "Sync problem. Changes are saved on this device.";
  // saved: only worth saying when the user was told something was wrong
  return prev === "offline" || prev === "error" ? "Back online. All changes saved." : null;
}
