import { isGuid } from "./boards";
import { isLocalOnly, requireOwner } from "./owner";
import type { ShareStore } from "./share-store";
import { MemoryShareStore } from "./share-store-memory";

/*
 * Who is asking, for the owner routes that go through the ShareStore (rounds, history, snapshots): the signed-in owner, or the
 * single local owner when the server runs in local-only mode (development and end-to-end tests: there is no account and the
 * boards live in the browser; the in-memory store learns of a board when it is first asked about, and holds whatever state the
 * browser handed over with PUT /api/boards/:id/local-state).
 */

/** The one owner of a local-only server (the share links code uses the same id). */
export const LOCAL_OWNER = "00000000-0000-4000-8000-00000000a7e1";
/** Board ids a local-only server accepts: whatever the browser made (a uuid or a test id), never a path. */
const LOCAL_BOARD_ID = /^[A-Za-z0-9_-]{1,80}$/;

export async function ownerOf(): Promise<{ userId: string }> {
  return isLocalOnly() ? { userId: LOCAL_OWNER } : requireOwner();
}

/** True when the board exists, is not in the trash, and belongs to `ownerId`. */
export async function ownedLiveBoard(store: ShareStore, boardId: string, ownerId: string): Promise<boolean> {
  if (isLocalOnly()) {
    if (!LOCAL_BOARD_ID.test(boardId) || !(store instanceof MemoryShareStore)) return false;
    if ((await store.getBoard(boardId)) === null) store.seedBoard({ id: boardId, ownerId });
    return true;
  }
  if (!isGuid(boardId)) return false;
  const board = await store.getBoard(boardId);
  return board !== null && board.deletedAt === null && board.ownerId.toLowerCase() === ownerId.toLowerCase();
}
