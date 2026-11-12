import { hamming } from "@/lib/engine/color/phash";

// Perceptual-hash clustering. Pure (no server or browser APIs), shared by the library API and the local-only library.

export const DUPLICATE_DISTANCE = 6;

export type HashItem = { id: string; phash: string | null };

/**
 * Clusters of two or more assets whose perceptual hashes are within `maxDist` bits (connected components: a picture joins
 * a group when it is that close to any member). `dist` is the largest distance between two members; exact matches are 0.
 * Items without a hash are ignored. Groups are ordered by size, then by their smallest id, so the answer is stable.
 */
export function clusterByHash(items: HashItem[], maxDist: number = DUPLICATE_DISTANCE): { assetIds: string[]; dist: number }[] {
  const list = items.filter((i): i is { id: string; phash: string } => typeof i.phash === "string" && i.phash.length === 16);
  const parent = list.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (hamming(list[i].phash, list[j].phash) <= maxDist) parent[find(i)] = find(j);
    }
  }
  const members = new Map<number, number[]>();
  list.forEach((_, i) => {
    const root = find(i);
    const m = members.get(root);
    if (m) m.push(i);
    else members.set(root, [i]);
  });
  const groups: { assetIds: string[]; dist: number }[] = [];
  for (const m of members.values()) {
    if (m.length < 2) continue;
    let dist = 0;
    for (let a = 0; a < m.length; a++) for (let b = a + 1; b < m.length; b++) dist = Math.max(dist, hamming(list[m[a]].phash, list[m[b]].phash));
    groups.push({ assetIds: m.map((i) => list[i].id).sort(), dist });
  }
  return groups.sort((a, b) => b.assetIds.length - a.assetIds.length || (a.assetIds[0] < b.assetIds[0] ? -1 : 1));
}

/** For each asset in a cluster, the others in reach of it directly (hamming <= maxDist). */
export function similarMap(items: HashItem[], maxDist: number = DUPLICATE_DISTANCE): Map<string, string[]> {
  const list = items.filter((i): i is { id: string; phash: string } => typeof i.phash === "string" && i.phash.length === 16);
  const out = new Map<string, string[]>();
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (hamming(list[i].phash, list[j].phash) > maxDist) continue;
      (out.get(list[i].id) ?? out.set(list[i].id, []).get(list[i].id)!).push(list[j].id);
      (out.get(list[j].id) ?? out.set(list[j].id, []).get(list[j].id)!).push(list[i].id);
    }
  }
  for (const v of out.values()) v.sort();
  return out;
}

