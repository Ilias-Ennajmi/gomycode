// Shapes of a published round, shared by the share store, the viewer board builder and (Task 9) the rounds service. Types
// only: no runtime code and no imports, so any layer can use them.

export interface RoundDiff {
  added: string[];
  removed: string[];
  changed: string[];
  /** Counts per top-most frame (or "_none" for objects outside every frame); exact even when the id lists are truncated. */
  byFrame: Record<string, { added: number; changed: number; removed: number }>;
  truncated: boolean;
}

export const EMPTY_ROUND_DIFF: RoundDiff = { added: [], removed: [], changed: [], byFrame: {}, truncated: false };

export interface Round {
  id: string;
  boardId: string;
  number: number;
  label: string;
  snapshotId: string;
  /** frameId -> R2 keys of the pre-rendered preview images (`p/{token}/{frameId}-w480.webp`) and their pixel size. */
  previews: Record<string, { w480: string; w1280: string; w: number; h: number }>;
  diff: RoundDiff;
  publishedAt: string;
}
