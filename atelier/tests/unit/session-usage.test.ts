import { afterEach, describe, expect, it, vi } from "vitest";
import { openBoardSession } from "@/lib/board/session";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";
import { newAssetId } from "@/lib/assets/asset-id";
import { AssetResolverImpl } from "@/lib/assets/resolver";
import { putBoard } from "@/lib/sync/board-list-cache";
import type { SyncApi } from "@/lib/sync/sync-client";

const BOARD = "00000000-0000-4000-8000-0000000000aa";
afterEach(() => vi.restoreAllMocks());

const syncApi = (): SyncApi => ({ push: vi.fn(async () => ({ seq: 1 })), pull: vi.fn(async () => ({ updates: [] })) });
const base = { resolver: new AssetResolverImpl({ publicHost: null }), createSyncApi: syncApi, createRealtime: () => undefined, syncOptions: { target: null } } as const;

async function seedBoard() {
  await putBoard({ id: BOARD, title: "Spring", folderId: null, starred: false, updatedAt: "2026-01-01T00:00:00.000Z", lastOpenedAt: null, deletedAt: null, preview: [] });
}

describe("openBoardSession tracks asset usage", () => {
  it("sends the board's asset ids when the board is left, signed in", async () => {
    await seedBoard();
    const putUsage = vi.fn(async () => {});
    const r = await openBoardSession({ boardId: BOARD, localOnly: false, ...base, usageApi: { putUsage } });
    if (r.status !== "ready") throw new Error("not ready");
    const assetId = newAssetId();
    r.board.doc.create({ ...defaultsFor("image"), assetId } as NewObject);
    await r.board.dispose();
    expect(putUsage).toHaveBeenCalledWith(BOARD, [assetId]);
  });

  it("does nothing in local-only mode", async () => {
    await seedBoard();
    const putUsage = vi.fn(async () => {});
    const r = await openBoardSession({ boardId: BOARD, localOnly: true, ...base, usageApi: { putUsage } });
    if (r.status !== "ready") throw new Error("not ready");
    r.board.doc.create({ ...defaultsFor("image"), assetId: newAssetId() } as NewObject);
    await r.board.dispose();
    expect(putUsage).not.toHaveBeenCalled();
  });
});
