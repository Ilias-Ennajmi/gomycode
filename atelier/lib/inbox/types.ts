export type InboxKind = "image" | "video" | "url" | "text";

export interface InboxItem {
  id: string;
  kind: InboxKind;
  assetId: string | null;
  url: string | null;
  text: string | null;
  title: string | null;
  sourceUrl: string | null;
  credit: string | null;
  createdAt: string;
  placedAt: string | null;
}

export type NewInboxItem = Omit<InboxItem, "id" | "createdAt" | "placedAt">;

/** At most this many unplaced items wait in the Inbox. */
export const INBOX_LIMIT = 200;
export const MAX_INBOX_TEXT = 10_000;
export const MAX_INBOX_TITLE = 300;
export const MAX_INBOX_URL = 2048;
export const MAX_INBOX_CREDIT = 500;

/** The words shown when the Inbox is full (also the server's `message`). */
export const INBOX_FULL_MESSAGE = `Your Inbox is full (${INBOX_LIMIT} items). Place some on a board or delete a few, then try again.`;

/** An http(s) address no longer than the limit, or null. Never `javascript:`, `data:` or `file:`. */
export function webUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (v === "" || v.length > MAX_INBOX_URL) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? v : null;
  } catch {
    return null;
  }
}

/** Short readable form of an address for a card: "example.com". */
export function hostOf(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
