import type { LibraryAsset } from "./library-types";

export type LibraryKind = "image" | "video" | "gif";
export type LibrarySort = "recent" | "used" | "size";

export type LibraryFilter = {
  /** Matched, ignoring case, against the title, credit, licence and source address. */
  query: string;
  kind: LibraryKind | null;
  sort: LibrarySort;
  /** Only assets no live board uses. */
  unused: boolean;
};

const haystack = (a: LibraryAsset) => [a.title, a.provenance?.credit, a.provenance?.licence, a.provenance?.sourceUrl].filter(Boolean).join("\n").toLowerCase();

const byRecent = (a: LibraryAsset, b: LibraryAsset) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? -1 : 1);

/** The library's filter and sort, shared by the server list and the local-only list so both answer the same way. */
export function filterAndSort(assets: LibraryAsset[], f: LibraryFilter): LibraryAsset[] {
  const needle = f.query.trim().toLowerCase();
  const out = assets.filter((a) => (!f.kind || a.kind === f.kind) && (!f.unused || a.usedIn === 0) && (!needle || haystack(a).includes(needle)));
  if (f.sort === "used") out.sort((a, b) => b.usedIn - a.usedIn || byRecent(a, b));
  else if (f.sort === "size") out.sort((a, b) => b.bytes - a.bytes || byRecent(a, b));
  else out.sort(byRecent);
  return out;
}
