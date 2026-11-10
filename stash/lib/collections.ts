import type { SaveItem } from "@/lib/data";

/*
 * Auto-collections: the smart groups in the Library (contract 0007: rpc auto_collections).
 * Pure mapping, ordering and the on-phone fallback, so it is unit-tested.
 */

export type CollectionKind = "tag" | "creator" | "intent" | "places";

export type AutoCollection = {
  /** `${kind}:${key}`: stable, used in the URL (?c=). */
  id: string;
  kind: CollectionKind;
  key: string;
  label: string;
  count: number;
  /** Newest first. */
  saveIds: string[];
  latest: string | null;
};

export type CollectionRow = { kind: string; key: string; label: string; n: number; save_ids: string[] | null; latest: string | null };

const KINDS: CollectionKind[] = ["tag", "creator", "intent", "places"];

const INTENT_LABEL: Record<string, string> = {
  learn: "To learn",
  try: "To try",
  visit: "To visit",
  buy: "To buy",
  inspire: "Inspiration",
  fun: "Just for fun",
};

export const KIND_LABEL: Record<CollectionKind, string> = { tag: "Topic", creator: "Creator", intent: "Why you saved it", places: "Places" };

export const collectionId = (kind: CollectionKind, key: string) => `${kind}:${key}`;

export function collectionLabel(kind: CollectionKind, key: string, fallback?: string): string {
  if (kind === "tag") return `#${key.replace(/^#/, "")}`;
  if (kind === "creator") return `@${key.replace(/^@/, "")}`;
  if (kind === "intent") return INTENT_LABEL[key] ?? fallback ?? key;
  return "Places";
}

/** Validates the RPC's rows; unknown kinds and empty groups are dropped. */
export function toCollections(rows: unknown): AutoCollection[] {
  if (!Array.isArray(rows)) return [];
  const out: AutoCollection[] = [];
  for (const raw of rows as Partial<CollectionRow>[]) {
    if (!raw || typeof raw.key !== "string" || !KINDS.includes(raw.kind as CollectionKind)) continue;
    const kind = raw.kind as CollectionKind;
    const saveIds = Array.isArray(raw.save_ids) ? raw.save_ids.filter((x): x is string => typeof x === "string") : [];
    if (!saveIds.length) continue;
    out.push({
      id: collectionId(kind, raw.key),
      kind,
      key: raw.key,
      label: collectionLabel(kind, raw.key, raw.label),
      count: saveIds.length,
      saveIds,
      latest: raw.latest ?? null,
    });
  }
  return out;
}

/**
 * The row's order: Places first when there are any, then the rest by size, with no kind
 * taking more than `perKind` of the first slots so tags don't crowd out creators.
 */
export function arrangeCollections(list: AutoCollection[], max = 14, perKind = 6): AutoCollection[] {
  const places = list.filter((c) => c.kind === "places");
  const rest = list
    .filter((c) => c.kind !== "places")
    .sort((a, b) => b.count - a.count || (b.latest ?? "").localeCompare(a.latest ?? "") || a.label.localeCompare(b.label));
  const taken = new Map<CollectionKind, number>();
  const first: AutoCollection[] = [];
  const later: AutoCollection[] = [];
  for (const c of rest) {
    const n = taken.get(c.kind) ?? 0;
    if (n < perKind) {
      first.push(c);
      taken.set(c.kind, n + 1);
    } else later.push(c);
  }
  return [...places, ...first, ...later].slice(0, max);
}

/** The saves of a collection that are still in the Library, in the collection's order. */
export function collectionSaves(c: AutoCollection, saves: SaveItem[]): SaveItem[] {
  const byId = new Map(saves.map((s) => [s.id, s]));
  return c.saveIds.map((id) => byId.get(id)).filter((s): s is SaveItem => Boolean(s) && !(s as SaveItem).archivedAt);
}

/**
 * Offline or before the RPC answers: tags and creators from the saves on the phone
 * (intents and places are not kept in the cached list).
 */
export function localCollections(saves: SaveItem[], min = 3): AutoCollection[] {
  const groups = new Map<string, { kind: CollectionKind; key: string; ids: string[]; latest: string }>();
  const add = (kind: CollectionKind, key: string, s: SaveItem) => {
    const id = collectionId(kind, key);
    const g = groups.get(id) ?? { kind, key, ids: [], latest: s.savedAt };
    if (!g.ids.includes(s.id)) g.ids.push(s.id);
    if (s.savedAt > g.latest) g.latest = s.savedAt;
    groups.set(id, g);
  };
  const live = saves.filter((s) => s.status === "ready" && !s.archivedAt).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  for (const s of live) {
    for (const t of s.tags) {
      const key = t.trim().toLowerCase();
      if (key) add("tag", key, s);
    }
    if (s.creator) add("creator", s.creator.toLowerCase(), s);
  }
  return [...groups.entries()]
    .filter(([, g]) => g.ids.length >= Math.max(2, min))
    .map(([id, g]) => ({ id, kind: g.kind, key: g.key, label: collectionLabel(g.kind, g.key), count: g.ids.length, saveIds: g.ids, latest: g.latest }));
}

/** The tag synthesis that belongs under a tag's collection (tags compare case-insensitively). */
export function synthesisForTag<T extends { tag?: string | null }>(syntheses: T[], tag: string): T | undefined {
  const key = tag.trim().toLowerCase().replace(/^#/, "");
  return syntheses.find((s) => (s.tag ?? "").trim().toLowerCase() === key);
}

export function findCollection(list: AutoCollection[], id: string | null | undefined): AutoCollection | undefined {
  return id ? list.find((c) => c.id === id) : undefined;
}
