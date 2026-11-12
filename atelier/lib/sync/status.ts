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
