import { IndexeddbPersistence } from "y-indexeddb";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import type { RestoreCopyDeps } from "@/lib/engine/doc/restore";
import { firstFrameName } from "@/lib/engine/model/templates";
import { putBoard } from "@/lib/sync/board-list-cache";
import { openLocalBoard } from "@/lib/sync/local-store";

/**
 * What "Open as copy" uses in the browser: a new board record (on the server, or just an id in local-only mode), its document
 * from IndexedDB, and an entry in this device's board list once it is filled. The first sync after opening the board pushes the
 * copy to the server, exactly as for an imported backup.
 */
export function createCopyDeps({ localOnly, fetchFn = (...a: Parameters<typeof fetch>) => globalThis.fetch(...a) }: { localOnly: boolean; fetchFn?: typeof fetch }): RestoreCopyDeps {
  const open = new Map<string, IndexeddbPersistence>();
  return {
    async createBoard(title) {
      if (localOnly) return crypto.randomUUID();
      const res = await fetchFn("/api/boards", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }) });
      if (!res.ok) throw new Error(res.status === 0 ? "you may be offline" : "the board could not be created");
      return ((await res.json()) as { id: string }).id;
    },
    async openDoc(id) {
      const { doc, persistence } = await openLocalBoard(id);
      open.set(id, persistence);
      return doc;
    },
    async closeDoc(id: string, doc: BoardDoc) {
      const now = new Date().toISOString();
      await putBoard({ id, title: doc.meta.title, folderId: null, starred: false, updatedAt: now, lastOpenedAt: null, deletedAt: null, preview: [], firstFrameName: firstFrameName(doc) });
      const persistence = open.get(id);
      open.delete(id);
      doc.destroy();
      await persistence?.destroy(); // closes the database after queued writes finish
    },
  };
}
