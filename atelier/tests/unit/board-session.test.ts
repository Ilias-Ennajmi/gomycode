import { afterEach, describe, expect, it, vi } from "vitest";
import { openBoardSession, probeBoard, loadBoardMeta, renameBoard } from "@/lib/board/session";
import { pickPreviewAssets, recordLeave } from "@/lib/board/leave";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";
import { newAssetId } from "@/lib/assets/asset-id";
import { AssetResolverImpl } from "@/lib/assets/resolver";
import type { SyncApi } from "@/lib/sync/sync-client";
import { putBoard, putFolder, readBoardList, type BoardSummary } from "@/lib/sync/board-list-cache";

let counter = 0;
const newBoardId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

const summary = (id: string, over: Partial<BoardSummary> = {}): BoardSummary => ({
  id,
  title: "Spring",
  folderId: null,
  starred: false,
  updatedAt: "2026-01-01T00:00:00.000Z",
  lastOpenedAt: null,
  deletedAt: null,
  preview: [],
  ...over,
});

function fakeApi() {
  const pushes: Uint8Array[] = [];
  const api: SyncApi = {
    push: vi.fn(async (_b, update) => {
      pushes.push(update);
      return { seq: pushes.length };
    }),
    pull: vi.fn(async () => ({ updates: [] })),
  };
  return { api, pushes };
}

const resolver = () => new AssetResolverImpl({ publicHost: null });
const status = (code: number) => new Response(JSON.stringify({}), { status: code });

afterEach(() => vi.restoreAllMocks());

describe("probeBoard", () => {
  it("found, not-found, or unknown when the server cannot be reached", async () => {
    expect(await probeBoard("b", (async () => status(200)) as typeof fetch)).toBe("found");
    expect(await probeBoard("b", (async () => status(404)) as typeof fetch)).toBe("not-found");
    expect(await probeBoard("b", (async () => status(500)) as typeof fetch)).toBe("unknown");
    expect(await probeBoard("b", (async () => status(403)) as typeof fetch)).toBe("unknown");
    expect(await probeBoard("b", (async () => Promise.reject(new TypeError("offline"))) as typeof fetch)).toBe("unknown");
  });
});

describe("openBoardSession, local-only", () => {
  it("opens an unknown id as an empty local board and lists it on the home screen", async () => {
    const id = newBoardId();
    const fetchFn = vi.fn();
    const r = await openBoardSession({ boardId: id, localOnly: true, fetchFn: fetchFn as unknown as typeof fetch, resolver: resolver() });
    expect(r.status).toBe("ready");
    if (r.status !== "ready") return;
    expect(r.board.doc.all()).toHaveLength(0);
    expect(r.board.sync).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled(); // no sync, no probe
    const list = await readBoardList();
    expect(list.boards.some((b) => b.id === id && b.title === "Untitled")).toBe(true);
    await r.board.dispose();
  });

  it("does not list a board that is already listed twice or overwrite its title", async () => {
    const id = newBoardId();
    await putBoard(summary(id, { title: "My board" }));
    const r = await openBoardSession({ boardId: id, localOnly: true, resolver: resolver() });
    if (r.status !== "ready") throw new Error("not ready");
    const list = await readBoardList();
    expect(list.boards.filter((b) => b.id === id)).toHaveLength(1);
    expect(list.boards.find((b) => b.id === id)!.title).toBe("My board");
    await r.board.dispose();
  });
});

describe("openBoardSession, signed in", () => {
  it("starts sync with the given api and pushes edits; dispose flushes first", async () => {
    const id = newBoardId();
    await putBoard(summary(id));
    const { api, pushes } = fakeApi();
    const r = await openBoardSession({
      boardId: id,
      localOnly: false,
      createSyncApi: () => api,
      createRealtime: () => undefined,
      syncOptions: { batchMs: 5, target: null },
      resolver: resolver(),
    });
    if (r.status !== "ready") throw new Error("not ready");
    expect(r.board.sync).not.toBeNull();
    r.board.doc.create({ ...defaultsFor("sticky") } as NewObject);
    await r.board.dispose(); // flush, then stop
    expect(pushes.length).toBeGreaterThan(0);
  });

  it("a board the server does not know (not in the list, nothing on this device) is not-found and leaves nothing behind", async () => {
    const id = newBoardId();
    const { api } = fakeApi();
    const probe = vi.fn(async () => status(404)) as unknown as typeof fetch;
    const r = await openBoardSession({ boardId: id, localOnly: false, fetchFn: probe, createSyncApi: () => api, createRealtime: () => undefined, resolver: resolver() });
    expect(r.status).toBe("not-found");
    expect(api.push).not.toHaveBeenCalled();
    const databases = await indexedDB.databases();
    expect(databases.some((d) => d.name === `atelier-board-${id}`)).toBe(false);
  });

  it("a board in the home list is opened without asking the server first", async () => {
    const id = newBoardId();
    await putBoard(summary(id));
    const probe = vi.fn(async () => status(404)) as unknown as typeof fetch;
    const { api } = fakeApi();
    const r = await openBoardSession({ boardId: id, localOnly: false, fetchFn: probe, createSyncApi: () => api, createRealtime: () => undefined, syncOptions: { target: null }, resolver: resolver() });
    expect(r.status).toBe("ready");
    expect(probe).not.toHaveBeenCalled();
    if (r.status === "ready") await r.board.dispose();
  });

  it("an unreachable server does not block opening a board this device has never seen", async () => {
    const id = newBoardId();
    const probe = vi.fn(async () => Promise.reject(new TypeError("offline"))) as unknown as typeof fetch;
    const { api } = fakeApi();
    const r = await openBoardSession({ boardId: id, localOnly: false, fetchFn: probe, createSyncApi: () => api, createRealtime: () => undefined, syncOptions: { target: null }, resolver: resolver() });
    expect(r.status).toBe("ready");
    if (r.status === "ready") await r.board.dispose();
  });
});

describe("loadBoardMeta", () => {
  it("title and folder breadcrumb come from the board list", async () => {
    const id = newBoardId();
    await putFolder({ id: "f1", name: "Clients", parentId: null, sort: 0 });
    await putFolder({ id: "f2", name: "Acme", parentId: "f1", sort: 0 });
    await putBoard(summary(id, { title: "Spring", folderId: "f2" }));
    const meta = await loadBoardMeta(id, new BoardDoc());
    expect(meta).toEqual({ title: "Spring", breadcrumb: ["Clients", "Acme"] });
  });

  it("falls back to the document's title, then Untitled", async () => {
    const doc = new BoardDoc();
    doc.meta.title = "From the doc";
    expect((await loadBoardMeta(newBoardId(), doc)).title).toBe("From the doc");
    expect((await loadBoardMeta(newBoardId(), new BoardDoc())).title).toBe("Untitled");
  });
});

describe("pickPreviewAssets", () => {
  const image = (assetId: string, w: number, h: number): NewObject => ({ ...defaultsFor("image"), assetId, w, h }) as NewObject;

  it("at most four distinct assets, largest images first", () => {
    const doc = new BoardDoc();
    const ids = Array.from({ length: 6 }, () => newAssetId());
    doc.createMany([image(ids[0], 100, 100), image(ids[1], 500, 400), image(ids[2], 300, 300), image(ids[3], 50, 50), image(ids[4], 800, 600), image(ids[1], 10, 10), image(ids[5], 200, 200)]);
    expect(pickPreviewAssets(doc)).toEqual([ids[4], ids[1], ids[2], ids[5]]);
  });

  it("ignores everything that is not an image and boards without images", () => {
    const doc = new BoardDoc();
    doc.create({ ...defaultsFor("sticky") } as NewObject);
    expect(pickPreviewAssets(doc)).toEqual([]);
  });
});

describe("recordLeave", () => {
  const withImage = () => {
    const doc = new BoardDoc();
    const assetId = newAssetId();
    doc.create({ ...defaultsFor("image"), assetId, w: 400, h: 300 } as NewObject);
    doc.create({ ...defaultsFor("frame"), name: "Direction A", order: "a0" } as NewObject);
    return { doc, assetId };
  };

  it("local-only: updates the home list (last opened, first frame, preview) and calls no server", async () => {
    const id = newBoardId();
    await putBoard(summary(id));
    const { doc, assetId } = withImage();
    const fetchFn = vi.fn();
    await recordLeave({ boardId: id, doc, localOnly: true, fetchFn: fetchFn as unknown as typeof fetch, now: Date.parse("2026-05-05T10:00:00.000Z") });
    const b = (await readBoardList()).boards.find((x) => x.id === id)!;
    expect(b.lastOpenedAt).toBe("2026-05-05T10:00:00.000Z");
    expect(b.firstFrameName).toBe("Direction A");
    expect(b.preview).toEqual([assetId]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("signed in: also PATCHes the board with the preview and last opened time", async () => {
    const id = newBoardId();
    await putBoard(summary(id));
    const { doc, assetId } = withImage();
    const fetchFn = vi.fn(async () => status(200));
    await recordLeave({ boardId: id, doc, localOnly: false, fetchFn: fetchFn as unknown as typeof fetch, now: Date.parse("2026-05-05T10:00:00.000Z") });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/boards/${id}`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ preview: [assetId], lastOpenedAt: "2026-05-05T10:00:00.000Z" });
    expect(init.keepalive).toBe(true);
  });

  it("a failing server never throws", async () => {
    const id = newBoardId();
    const { doc } = withImage();
    await expect(recordLeave({ boardId: id, doc, localOnly: false, fetchFn: (async () => Promise.reject(new TypeError("offline"))) as typeof fetch })).resolves.toBeUndefined();
  });
});

describe("renameBoard", () => {
  const rename = (over: Parameters<typeof renameBoard>[0]) => renameBoard(over);

  it("local-only: changes the home list's title and nothing else", async () => {
    const id = newBoardId();
    await putBoard(summary(id, { title: "Old" }));
    const fetchFn = vi.fn();
    const r = await rename({ boardId: id, title: "New", localOnly: true, fetchFn: fetchFn as unknown as typeof fetch });
    expect(r).toEqual({ ok: true });
    expect((await readBoardList()).boards.find((b) => b.id === id)!.title).toBe("New");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("signed in: PATCHes the title; a refusal puts the old title back", async () => {
    const id = newBoardId();
    await putBoard(summary(id, { title: "Old" }));
    const ok = vi.fn(async () => status(200)) as unknown as typeof fetch;
    expect(await rename({ boardId: id, title: "New", localOnly: false, fetchFn: ok })).toEqual({ ok: true });
    const [url, init] = (ok as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/boards/${id}`);
    expect(JSON.parse(String(init.body))).toEqual({ title: "New" });

    const no = (async () => status(403)) as typeof fetch;
    expect(await rename({ boardId: id, title: "Other", localOnly: false, fetchFn: no })).toEqual({ ok: false, reason: "rejected" });
    expect((await readBoardList()).boards.find((b) => b.id === id)!.title).toBe("New");
  });

  it("offline: reverts and says so", async () => {
    const id = newBoardId();
    await putBoard(summary(id, { title: "Old" }));
    const off = (async () => Promise.reject(new TypeError("offline"))) as typeof fetch;
    expect(await rename({ boardId: id, title: "New", localOnly: false, fetchFn: off })).toEqual({ ok: false, reason: "offline" });
    expect((await readBoardList()).boards.find((b) => b.id === id)!.title).toBe("Old");
  });

  it("a board that is not in the list yet is added with its new title", async () => {
    const id = newBoardId();
    await rename({ boardId: id, title: "Fresh", localOnly: true });
    expect((await readBoardList()).boards.find((b) => b.id === id)!.title).toBe("Fresh");
  });
});

describe("opening marks the board as recent on this device", () => {
  it("sets lastOpenedAt in the home list", async () => {
    const id = newBoardId();
    await putBoard(summary(id));
    const r = await openBoardSession({ boardId: id, localOnly: true, resolver: resolver() });
    if (r.status !== "ready") throw new Error("not ready");
    await new Promise((res) => setTimeout(res, 50));
    expect((await readBoardList()).boards.find((b) => b.id === id)!.lastOpenedAt).not.toBeNull();
    await r.board.dispose();
  });
});
