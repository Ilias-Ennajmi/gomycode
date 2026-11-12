import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  patchBoard,
  purgeExpiredTrash,
  putBoard,
  putFolder,
  readBoardList,
  removeBoard,
  removeFolder,
  replaceBoardList,
  splitBoards,
  type BoardSummary,
} from "@/lib/sync/board-list-cache";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 12, 12, 0, 0);
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();

const board = (id: string, over: Partial<BoardSummary> = {}): BoardSummary => ({
  id,
  title: `Board ${id}`,
  folderId: null,
  starred: false,
  updatedAt: iso(1),
  lastOpenedAt: null,
  deletedAt: null,
  preview: [],
  ...over,
});

beforeEach(async () => {
  await new Promise<void>((resolve) => {
    const r = indexedDB.deleteDatabase("atelier-board-list");
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
});

describe("splitBoards", () => {
  it("puts live boards in boards and boards deleted within 30 days in trash; drops older ones", () => {
    const all = [
      board("live"),
      board("recent", { deletedAt: iso(2) }),
      board("edge", { deletedAt: iso(29.9) }),
      board("old", { deletedAt: iso(30.1) }),
    ];
    const { boards, trash } = splitBoards(all, NOW);
    expect(boards.map((b) => b.id)).toEqual(["live"]);
    expect(trash.map((b) => b.id).sort()).toEqual(["edge", "recent"]);
  });
});

describe("board list cache (IndexedDB)", () => {
  it("is empty before anything is stored", async () => {
    expect(await readBoardList(NOW)).toEqual({ boards: [], trash: [], folders: [] });
  });

  it("stores and reads boards and folders", async () => {
    await putBoard(board("a"));
    await putBoard(board("b", { deletedAt: iso(1) }));
    await putFolder({ id: "f", name: "Clients", parentId: null, sort: 0 });
    const list = await readBoardList(NOW);
    expect(list.boards.map((b) => b.id)).toEqual(["a"]);
    expect(list.trash.map((b) => b.id)).toEqual(["b"]);
    expect(list.folders).toEqual([{ id: "f", name: "Clients", parentId: null, sort: 0 }]);
  });

  it("patches, removes and updates in place", async () => {
    await putBoard(board("a"));
    await patchBoard("a", { title: "Renamed", starred: true });
    expect((await readBoardList(NOW)).boards[0]).toMatchObject({ title: "Renamed", starred: true });
    await patchBoard("missing", { title: "x" }); // no-op, no throw
    await removeBoard("a");
    expect((await readBoardList(NOW)).boards).toEqual([]);
    await putFolder({ id: "f", name: "x", parentId: null, sort: 0 });
    await removeFolder("f");
    expect((await readBoardList(NOW)).folders).toEqual([]);
  });

  it("replaceBoardList mirrors the server and keeps what only this device knows", async () => {
    await putBoard(board("a", { firstFrameName: "Slide 1" }));
    await putBoard(board("gone"));
    await replaceBoardList({ boards: [board("a", { title: "From server" })], trash: [board("t", { deletedAt: iso(3) })], folders: [] });
    const list = await readBoardList(NOW);
    expect(list.boards).toHaveLength(1);
    expect(list.boards[0]).toMatchObject({ id: "a", title: "From server", firstFrameName: "Slide 1" });
    expect(list.trash.map((b) => b.id)).toEqual(["t"]);
  });

  it("purgeExpiredTrash removes boards deleted more than 30 days ago and returns their ids", async () => {
    await putBoard(board("keep", { deletedAt: iso(5) }));
    await putBoard(board("expired", { deletedAt: iso(45) }));
    await putBoard(board("live"));
    expect(await purgeExpiredTrash(NOW)).toEqual(["expired"]);
    const list = await readBoardList(NOW);
    expect(list.boards.map((b) => b.id)).toEqual(["live"]);
    expect(list.trash.map((b) => b.id)).toEqual(["keep"]);
  });

  it("never throws when IndexedDB is unavailable: reads are empty, writes are no-ops", async () => {
    const real = globalThis.indexedDB;
    vi.stubGlobal("indexedDB", {
      open: () => {
        throw new Error("blocked");
      },
    });
    try {
      expect(await readBoardList(NOW)).toEqual({ boards: [], trash: [], folders: [] });
      await expect(putBoard(board("a"))).resolves.toBeUndefined();
      await expect(replaceBoardList({ boards: [], trash: [], folders: [] })).resolves.toBeUndefined();
    } finally {
      vi.stubGlobal("indexedDB", real);
    }
  });
});
