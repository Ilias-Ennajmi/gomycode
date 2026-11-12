import type { PreviewFrame, Round } from "@/lib/share/round-types";
import { diffObjects } from "@/lib/engine/rounds/diff";
import { RoundNumberTakenError, type NewRound, type ShareStore } from "./share-store";
import { decodeBoardState } from "./state";

export type { Round, RoundDiff } from "@/lib/share/round-types";

/*
 * Publishing a round. The state a round freezes is read on the server from the owner's stored updates and snapshots, never
 * taken from the browser: the browser only supplies the frame list for the preview images it rendered, and even those are
 * reduced to keys this server builds itself.
 */

export const MAX_LABEL = 120;
/** A nanoid(22): the random folder the previews of one publish are uploaded under. */
export const PREVIEW_TOKEN = /^[A-Za-z0-9_-]{22}$/;
export const PREVIEW_FRAME_ID = /^[A-Za-z0-9_-]{1,40}$/;
/** Preview image pixel sizes are clamped to this range. */
const MAX_PX = 100_000;

export type { PreviewFrame };

/** The R2 keys of one frame's preview images (the viewer reads these; the owner uploads to them with presigned URLs). */
export function previewKeys(token: string, frameId: string): { w480: string; w1280: string } {
  return { w480: `p/${token}/${frameId}-w480.webp`, w1280: `p/${token}/${frameId}-w1280.webp` };
}

/** Snapshots the board's current state as a `round` snapshot (it never deletes update rows). */
export async function snapshotRound(boardId: string, label: string, store: Pick<ShareStore, "snapshotBoard">): Promise<{ snapshotId: string; uptoSeq: number; state: Uint8Array }> {
  const snap = await store.snapshotBoard(boardId, "round", label);
  return { snapshotId: snap.id, uptoSeq: snap.uptoSeq, state: snap.state };
}

/** A label as the owner typed it, made safe to store and show: no control or bidi-override characters, one-spaced, at most 120. */
export function cleanLabel(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LABEL)
    .trim();
}

const px = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.min(MAX_PX, Math.max(1, Math.round(v))) : 1);

export interface PublishArgs {
  boardId: string;
  ownerId: string;
  label: string;
  /** The folder the previews were uploaded under, or null when there are none. */
  previewToken: string | null;
  frames: PreviewFrame[];
}

/**
 * Takes the snapshot, diffs it against the previous round's, and records the round. The number is the previous round's + 1;
 * when a concurrent publish took it, the number (and the diff) is worked out again once. A failure removes the snapshot made
 * for it, so a failed publish leaves nothing behind.
 */
export async function publishRound(a: PublishArgs, store: ShareStore): Promise<Round> {
  const label = cleanLabel(a.label);
  const snap = await snapshotRound(a.boardId, label || "Round", store);
  try {
    const { objects, texts } = decodeBoardState(snap.state);

    const previews: Round["previews"] = {};
    if (a.previewToken !== null && PREVIEW_TOKEN.test(a.previewToken)) {
      for (const f of a.frames) {
        if (typeof f?.frameId !== "string" || !PREVIEW_FRAME_ID.test(f.frameId)) continue;
        if (objects.get(f.frameId)?.type !== "frame") continue;
        previews[f.frameId] = { ...previewKeys(a.previewToken, f.frameId), w: px(f.w), h: px(f.h) };
      }
    }

    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const previous = await store.latestRound(a.boardId);
      const number = (previous?.number ?? 0) + 1;
      let before: ReturnType<typeof decodeBoardState> | null = null;
      if (previous) {
        const prevState = await store.getSnapshotState(previous.snapshotId, a.boardId);
        try {
          before = prevState ? decodeBoardState(prevState) : null;
        } catch {
          before = null; // an unreadable earlier snapshot: everything counts as added rather than the publish failing
        }
      }
      const diff = diffObjects(before?.objects ?? null, objects, { prev: before?.texts ?? null, next: texts });
      const row: NewRound = { boardId: a.boardId, number, label: label || `Round ${number}`, snapshotId: snap.snapshotId, previews, diff };
      try {
        return await store.insertRound(row);
      } catch (e) {
        if (!(e instanceof RoundNumberTakenError)) throw e;
        lastError = e;
      }
    }
    throw lastError;
  } catch (e) {
    await store.deleteSnapshot(snap.snapshotId, a.boardId).catch(() => undefined);
    throw e;
  }
}
