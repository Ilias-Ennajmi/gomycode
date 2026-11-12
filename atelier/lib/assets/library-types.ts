import type { AssetMeta } from "./meta-store";

/** One asset as the library page shows it: the canvas's metadata plus where it is used. */
export interface LibraryAsset extends AssetMeta {
  /** Live boards (not in the trash) that use the asset. */
  usedIn: number;
  /** Up to five of them. */
  boards: { id: string; title: string }[];
  createdAt: string;
  /** Other assets whose perceptual hash is within 6 bits of this one. */
  similarTo: string[];
}

/** Two or more assets whose perceptual hashes are close; `dist` is the largest distance inside the group (0 = exact copies). */
export type DuplicateGroup = { assetIds: string[]; dist: number };

/** A readable file size: "2.4 MB", "310 KB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

export const boardsLabel = (n: number): string => (n === 0 ? "Not used in any board" : n === 1 ? "Used in 1 board" : `Used in ${n} boards`);
