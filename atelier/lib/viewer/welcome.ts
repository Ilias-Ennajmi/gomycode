// "Seen the welcome note" per link, kept in this browser only. Storage can be blocked or full: every access is guarded and the
// page works without it (the note then shows again next visit).
const key = (linkKey: string) => `atelier-share-welcome:${linkKey}`;

export function welcomeSeen(linkKey: string): boolean {
  try {
    return localStorage.getItem(key(linkKey)) === "1";
  } catch {
    return false;
  }
}

export function markWelcomeSeen(linkKey: string): void {
  try {
    localStorage.setItem(key(linkKey), "1");
  } catch {
    /* blocked */
  }
}
