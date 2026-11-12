"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  patchBoard,
  purgeExpiredTrash,
  putBoard,
  putFolder,
  readBoardList,
    removeFolder,
  replaceBoardList,
  splitBoards,
  type BoardList,
  type BoardSummary,
  type Folder,
} from "@/lib/sync/board-list-cache";
import { createLocalBoardDoc, deleteLocalBoardDoc, readLocalBoardState, writeLocalBoardCopy } from "./board-docs";

/*
 * The home screen's data. Local-first: every change is applied to what is on screen and to the
 * IndexedDB copy first. Signed in, the server is told next and the change is taken back (with a
 * message) if it refuses; offline the screen is read-only. In local-only mode there is no server:
 * the IndexedDB list is the list.
 */

type State = { all: BoardSummary[]; folders: Folder[] };
const EMPTY: State = { all: [], folders: [] };

export type DuplicateOutcome = "ok" | "not-on-device" | "failed";

const uuid = () => crypto.randomUUID();

/** Network call that never throws: null means "no connection". */
async function call(method: string, url: string, body?: unknown): Promise<Response | null> {
  try {
    return await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

export function useLibrary({ localOnly, notify }: { localOnly: boolean; notify: (message: string) => void }) {
  const [state, setState] = useState<State>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const stateRef = useRef(state);
  const notifyRef = useRef(notify);
  useEffect(() => {
    notifyRef.current = notify;
  });

  const set = useCallback((fn: (s: State) => State) => {
    setState((s) => {
      const next = fn(s);
      stateRef.current = next;
      return next;
    });
  }, []);

  const fromCache = useCallback(async () => {
    const list = await readBoardList();
    set(() => ({ all: [...list.boards, ...list.trash], folders: list.folders }));
  }, [set]);

  const refresh = useCallback(async () => {
    const res = await call("GET", "/api/boards");
    if (!res) return setOffline(true);
    if (res.status === 401 || res.status === 403) {
      window.location.replace("/login");
      return;
    }
    if (!res.ok) return setOffline(true);
    let data: BoardList;
    try {
      data = (await res.json()) as BoardList;
    } catch {
      return setOffline(true);
    }
    setOffline(false);
    await replaceBoardList(data);
    await fromCache(); // keeps what only this device knows (first frame names)
  }, [fromCache]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (localOnly) for (const id of await purgeExpiredTrash()) void deleteLocalBoardDoc(id);
      await fromCache();
      if (!alive) return;
      setLoaded(true);
      if (!localOnly) await refresh();
    })();
    if (localOnly) return () => void (alive = false);
    const goOffline = () => setOffline(true);
    const goOnline = () => void refresh();
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      alive = false;
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, [localOnly, fromCache, refresh]);

  const list: BoardList = useMemo(() => ({ ...splitBoards(state.all), folders: state.folders }), [state]);
  const readOnly = !localOnly && offline;

  // ---- helpers ---------------------------------------------------------------------------------------

  const find = (id: string) => stateRef.current.all.find((b) => b.id === id);

  /** Apply a change to one board on screen and in the cache; returns how to take it back. */
  function applyBoard(id: string, patch: Partial<BoardSummary>): () => void {
    const prev = find(id);
    if (!prev) return () => {};
    set((s) => ({ ...s, all: s.all.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
    void patchBoard(id, patch);
    return () => {
      set((s) => ({ ...s, all: s.all.map((b) => (b.id === id ? prev : b)) }));
      void putBoard(prev);
    };
  }

  /** Tell the server about a change; undo it on screen when the server says no. */
  async function sync(method: string, url: string, body: unknown, revert: () => void, failure: string): Promise<boolean> {
    if (localOnly) return true;
    const res = await call(method, url, body);
    if (res?.ok) return true;
    revert();
    notifyRef.current(res ? failure : "You're offline, so that change wasn't saved.");
    return false;
  }

  const addBoard = (b: BoardSummary) => {
    set((s) => ({ ...s, all: [b, ...s.all.filter((x) => x.id !== b.id)] }));
    void putBoard(b);
  };

  const newSummary = (id: string, title: string, folderId: string | null, firstFrameName: string | null): BoardSummary => ({
    id,
    title,
    folderId,
    starred: false,
    updatedAt: new Date().toISOString(),
    lastOpenedAt: null,
    deletedAt: null,
    preview: [],
    firstFrameName,
  });

  // ---- boards ----------------------------------------------------------------------------------------

  /** Creates a board (and its local document from the template); resolves with its id. */
  async function createBoard(input: { title: string; folderId: string | null; templateId: string }): Promise<string | null> {
    const title = input.title.trim() || "Untitled";
    let id: string;
    if (localOnly) {
      id = uuid();
    } else {
      const res = await call("POST", "/api/boards", {
        title,
        ...(input.folderId ? { folderId: input.folderId } : {}),
        templateId: input.templateId,
      });
      if (!res?.ok) {
        notifyRef.current(res ? "Couldn't create the board. Try again." : "You're offline, so a new board can't be created.");
        return null;
      }
      try {
        id = ((await res.json()) as { id: string }).id;
      } catch {
        notifyRef.current("Couldn't create the board. Try again.");
        return null;
      }
    }
    const { firstFrameName } = await createLocalBoardDoc(id, { title, templateId: input.templateId });
    addBoard(newSummary(id, title, input.folderId, firstFrameName));
    return id;
  }

  async function renameBoard(id: string, title: string) {
    const next = title.trim();
    if (!next || next === find(id)?.title) return;
    const revert = applyBoard(id, { title: next });
    await sync("PATCH", `/api/boards/${id}`, { title: next }, revert, "Couldn't rename the board.");
  }

  async function moveBoard(id: string, folderId: string | null) {
    if (find(id)?.folderId === folderId) return;
    const revert = applyBoard(id, { folderId });
    await sync("PATCH", `/api/boards/${id}`, { folderId }, revert, "Couldn't move the board.");
  }

  async function setStarred(id: string, starred: boolean) {
    const revert = applyBoard(id, { starred });
    await sync("PATCH", `/api/boards/${id}`, { starred }, revert, "Couldn't change the star.");
  }

  async function trashBoard(id: string): Promise<boolean> {
    const revert = applyBoard(id, { deletedAt: new Date().toISOString() });
    return sync("DELETE", `/api/boards/${id}`, undefined, revert, "Couldn't delete the board.");
  }

  async function restoreBoard(id: string): Promise<boolean> {
    const revert = applyBoard(id, { deletedAt: null });
    if (localOnly) return true;
    const res = await call("PATCH", `/api/boards/${id}`, { deletedAt: null });
    if (res?.ok) return true;
    revert();
    notifyRef.current(
      res?.status === 410
        ? "This board has been in the trash for more than 30 days and can't be restored."
        : res
          ? "Couldn't restore the board."
          : "You're offline, so that change wasn't saved.",
    );
    return false;
  }

  async function duplicateBoard(id: string): Promise<DuplicateOutcome> {
    const source = find(id);
    if (!source) return "failed";
    // The copy is made from this device's copy of the document, so check there is one first.
    const state = await readLocalBoardState(id);
    if (!state) return "not-on-device";
    const title = `${source.title} copy`.slice(0, 300);
    let newId: string;
    if (localOnly) {
      newId = uuid();
    } else {
      const res = await call("POST", "/api/boards", { title, ...(source.folderId ? { folderId: source.folderId } : {}) });
      if (!res?.ok) return "failed";
      try {
        newId = ((await res.json()) as { id: string }).id;
      } catch {
        return "failed";
      }
    }
    const { firstFrameName } = await writeLocalBoardCopy(newId, state, title);
    addBoard({ ...newSummary(newId, title, source.folderId, firstFrameName), preview: source.preview });
    return "ok";
  }

  // ---- folders ---------------------------------------------------------------------------------------

  async function createFolder(name: string, parentId: string | null): Promise<void> {
    const clean = name.trim();
    if (!clean) return;
    let folder: Folder = { id: uuid(), name: clean, parentId, sort: stateRef.current.folders.length };
    if (!localOnly) {
      const res = await call("POST", "/api/folders", { name: clean, ...(parentId ? { parentId } : {}) });
      if (!res?.ok) {
        notifyRef.current(res ? "Couldn't create the folder." : "You're offline, so a new folder can't be created.");
        return;
      }
      try {
        folder = (await res.json()) as Folder;
      } catch {
        notifyRef.current("Couldn't create the folder.");
        return;
      }
    }
    set((s) => ({ ...s, folders: [...s.folders, folder] }));
    void putFolder(folder);
  }

  async function renameFolder(id: string, name: string): Promise<void> {
    const clean = name.trim();
    const prev = stateRef.current.folders.find((f) => f.id === id);
    if (!clean || !prev || prev.name === clean) return;
    const next = { ...prev, name: clean };
    set((s) => ({ ...s, folders: s.folders.map((f) => (f.id === id ? next : f)) }));
    void putFolder(next);
    await sync("PATCH", `/api/folders/${id}`, { name: clean }, () => {
      set((s) => ({ ...s, folders: s.folders.map((f) => (f.id === id ? prev : f)) }));
      void putFolder(prev);
    }, "Couldn't rename the folder.");
  }

  async function deleteFolder(id: string): Promise<void> {
    const prevState = stateRef.current;
    const gone = prevState.folders.find((f) => f.id === id);
    if (!gone) return;
    // Sub-folders move up a level; boards in the folder become unfiled (same as the server does).
    const lifted = prevState.folders.filter((f) => f.id !== id).map((f) => (f.parentId === id ? { ...f, parentId: gone.parentId } : f));
    const unfiled = prevState.all.map((b) => (b.folderId === id ? { ...b, folderId: null } : b));
    set(() => ({ all: unfiled, folders: lifted }));
    void removeFolder(id);
    for (const f of lifted) if (f.parentId !== (prevState.folders.find((p) => p.id === f.id)?.parentId ?? null)) void putFolder(f);
    for (const b of unfiled) if (b.folderId !== (prevState.all.find((p) => p.id === b.id)?.folderId ?? null)) void patchBoard(b.id, { folderId: null });
    await sync("DELETE", `/api/folders/${id}`, undefined, () => {
      set(() => prevState);
      void putFolder(gone);
      for (const f of prevState.folders) void putFolder(f);
      for (const b of prevState.all) void putBoard(b);
    }, "Couldn't delete the folder.");
  }

  return {
    list,
    loaded,
    offline,
    readOnly,
    actions: { createBoard, renameBoard, moveBoard, setStarred, trashBoard, restoreBoard, duplicateBoard, createFolder, renameFolder, deleteFolder },
  };
}
