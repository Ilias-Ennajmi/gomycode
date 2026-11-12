import { TRASH_DAYS, type BoardList, type BoardSummary, type Folder } from "@/lib/sync/board-list-cache";

/** Pure helpers behind the home screen: what each view shows, search, folders and time labels. */

export type View = { kind: "recent" } | { kind: "starred" } | { kind: "folder"; id: string } | { kind: "trash" };

const DAY_MS = 86_400_000;

/** Case-insensitive substring match on the title. The query is text, never a pattern. */
export function filterBoards(boards: BoardSummary[], query: string): BoardSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return boards;
  return boards.filter((b) => b.title.toLowerCase().includes(q));
}

const touched = (b: BoardSummary) => Date.parse(b.lastOpenedAt ?? b.updatedAt) || 0;

/** Newest first by last opened, else last edited. Returns a new array. */
export function sortRecent(boards: BoardSummary[]): BoardSummary[] {
  return [...boards].sort((a, b) => touched(b) - touched(a));
}

/**
 * The boards a view shows. A search looks through every live board whatever the view (so the
 * answer is never hidden in another folder); inside the trash it searches the trash.
 */
export function viewBoards(list: BoardList, view: View, query: string): BoardSummary[] {
  if (view.kind === "trash") {
    return filterBoards([...list.trash].sort((a, b) => (Date.parse(b.deletedAt ?? "") || 0) - (Date.parse(a.deletedAt ?? "") || 0)), query);
  }
  if (query.trim()) return filterBoards(sortRecent(list.boards), query);
  switch (view.kind) {
    case "recent":
      return sortRecent(list.boards);
    case "starred":
      return sortRecent(list.boards.filter((b) => b.starred));
    case "folder":
      return sortRecent(list.boards.filter((b) => b.folderId === view.id));
  }
}

export type FolderNode = { folder: Folder; depth: number; children: FolderNode[] };

/** Nested folders, sorted by `sort` then name. A missing parent or a cycle in bad data makes a folder top level. */
export function buildFolderTree(folders: Folder[]): FolderNode[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const parentOf = (f: Folder): string | null => {
    if (!f.parentId || !byId.has(f.parentId)) return null;
    const seen = new Set([f.id]);
    for (let cur: Folder | undefined = byId.get(f.parentId); cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) {
      if (seen.has(cur.id)) return null; // cycle
      seen.add(cur.id);
    }
    return f.parentId;
  };
  const kids = new Map<string | null, Folder[]>();
  for (const f of folders) {
    const p = parentOf(f);
    const list = kids.get(p);
    if (list) list.push(f);
    else kids.set(p, [f]);
  }
  const make = (parent: string | null, depth: number): FolderNode[] =>
    (kids.get(parent) ?? [])
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
      .map((folder) => ({ folder, depth, children: make(folder.id, depth + 1) }));
  return make(null, 0);
}

/** "Clients / Acme" for a folder id, or "" when it does not exist. */
export function folderPath(folders: Folder[], id: string): string {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const names: string[] = [];
  const seen = new Set<string>();
  for (let cur = byId.get(id); cur && !seen.has(cur.id); cur = cur.parentId ? byId.get(cur.parentId) : undefined) {
    seen.add(cur.id);
    names.unshift(cur.name);
  }
  return names.join(" / ");
}

/** Whole days left before a trashed board is gone for good (30 at deletion, never below 0). */
export function daysLeftInTrash(deletedAt: string, now: number = Date.now()): number {
  const t = Date.parse(deletedAt);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.min(TRASH_DAYS, Math.ceil(TRASH_DAYS - (now - t) / DAY_MS)));
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "just now", "5 minutes ago", "yesterday", "2 months ago"; "" for an unreadable date. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const seconds = Math.round((t - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return "just now";
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 86_400 * 30) return rtf.format(Math.round(seconds / 86_400), "day");
  if (abs < 86_400 * 365) return rtf.format(Math.round(seconds / (86_400 * 30)), "month");
  return rtf.format(Math.round(seconds / (86_400 * 365)), "year");
}
