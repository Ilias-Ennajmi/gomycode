import type { SaveItem } from "@/lib/data";

export const FILTERS = ["all", "unwatched", "kept", "applied", "archived", "instagram", "tiktok"] as const;
export type Filter = (typeof FILTERS)[number];

export const FILTER_LABEL: Record<Filter, string> = {
  all: "All",
  unwatched: "Unwatched",
  kept: "Kept",
  applied: "Applied",
  archived: "Archived",
  instagram: "Instagram",
  tiktok: "TikTok",
};

export function isFilter(v: string | null | undefined): v is Filter {
  return (FILTERS as readonly string[]).includes(v ?? "");
}

/** `space`: a Space id, "inbox" (also catches saves the AI hasn't filed yet) or null for everything. */
export function filterSaves(
  saves: SaveItem[],
  { space, filter, inboxId }: { space: string | null; filter: Filter; inboxId: string | null },
): SaveItem[] {
  return saves.filter((s) => {
    if (space === "inbox" || (space && space === inboxId)) {
      if (s.spaceId && s.spaceId !== inboxId) return false;
    } else if (space && s.spaceId !== space) {
      return false;
    }
    if (filter === "archived") return Boolean(s.archivedAt);
    if (s.archivedAt) return false;
    switch (filter) {
      case "unwatched":
        return !s.watchedAt;
      case "kept":
        return s.kept;
      case "applied":
        return Boolean(s.appliedAt);
      case "instagram":
      case "tiktok":
        return s.platform === filter;
      default:
        return true;
    }
  });
}

export function spaceCounts(saves: SaveItem[], inboxId: string | null): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of saves) {
    if (s.archivedAt) continue;
    const key = s.spaceId ?? inboxId;
    if (key) counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export type QueueParams = {
  queue?: string | null;
  space?: string | null;
  filter?: string | null;
  ids?: string | null;
  id?: string | null;
};

export const TODAY_SIZE = 5;

/**
 * What Play plays. Order matters: `ids` keeps the given order (search results),
 * a single `id` starts there and continues with the rest of its Space.
 */
export function buildQueue(saves: SaveItem[], p: QueueParams, inboxId: string | null): SaveItem[] {
  const playable = (s: SaveItem) => s.status !== "queued" && s.status !== "processing";

  if (p.ids) {
    const byId = new Map(saves.map((s) => [s.id, s]));
    return p.ids
      .split(",")
      .map((id) => byId.get(id))
      .filter((s): s is SaveItem => Boolean(s) && playable(s as SaveItem));
  }

  if (p.id) {
    const start = saves.find((s) => s.id === p.id);
    if (!start) return [];
    const rest = filterSaves(saves, { space: start.spaceId ?? "inbox", filter: "all", inboxId }).filter(
      (s) => s.id !== start.id && playable(s) && !s.watchedAt,
    );
    return [start, ...rest];
  }

  if (p.space || p.filter) {
    const filter = isFilter(p.filter) ? p.filter : "all";
    return filterSaves(saves, { space: p.space ?? null, filter, inboxId }).filter(playable);
  }

  // "Your 5 for today" (Phase 2 makes this smarter): the newest unwatched saves.
  return saves.filter((s) => playable(s) && !s.archivedAt && !s.watchedAt).slice(0, TODAY_SIZE);
}
