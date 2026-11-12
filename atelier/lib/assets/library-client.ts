import type { LibraryFilter } from "./library-query";
import type { DuplicateGroup, LibraryAsset } from "./library-types";

export type RemoveResult =
  | { ok: true }
  | { ok: false; reason: "in-use" | "in-trashed-board" | "offline" | "storage" | "failed"; message: string };

/** What the library page needs. The signed-in app talks to the server; local-only mode reads this device. */
export interface LibraryApi {
  list(filter: LibraryFilter): Promise<LibraryAsset[]>;
  duplicates(): Promise<DuplicateGroup[]>;
  remove(assetId: string): Promise<RemoveResult>;
}

export class LibraryLoadError extends Error {
  constructor(readonly kind: "offline" | "login" | "failed") {
    super(kind);
  }
}

const MESSAGES: Record<string, string> = {
  "in-use": "A board still uses this picture. Take it off those boards first.",
  "in-trashed-board": "A board in the trash still uses this picture. Empty that board or take the picture off it first.",
  "storage-delete-failed": "The stored files could not be deleted, so nothing was removed. Try again in a moment.",
  "storage-not-configured": "File storage is not set up on this server, so nothing was removed.",
};

/** The browser's side of GET /api/assets (list), GET /api/assets/duplicates and DELETE /api/assets/:id. */
export function createHttpLibraryApi(fetchFn?: typeof fetch): LibraryApi {
  const f = fetchFn ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const get = async (url: string): Promise<unknown> => {
    let res: Response;
    try {
      res = await f(url, { cache: "no-store" });
    } catch {
      throw new LibraryLoadError("offline");
    }
    if (res.status === 401 || res.status === 403) throw new LibraryLoadError("login");
    if (!res.ok) throw new LibraryLoadError("failed");
    try {
      return await res.json();
    } catch {
      throw new LibraryLoadError("failed");
    }
  };
  return {
    async list(filter) {
      const p = new URLSearchParams({ sort: filter.sort, limit: "200" });
      if (filter.query.trim()) p.set("query", filter.query.trim());
      if (filter.kind) p.set("kind", filter.kind);
      if (filter.unused) p.set("unused", "1");
      const body = (await get(`/api/assets?${p}`)) as { assets?: unknown };
      return Array.isArray(body.assets) ? (body.assets as LibraryAsset[]) : [];
    },
    async duplicates() {
      const body = (await get("/api/assets/duplicates")) as { groups?: unknown };
      return Array.isArray(body.groups) ? (body.groups as DuplicateGroup[]) : [];
    },
    async remove(assetId) {
      let res: Response;
      try {
        res = await f(`/api/assets/${encodeURIComponent(assetId)}`, { method: "DELETE" });
      } catch {
        return { ok: false, reason: "offline", message: "You're offline, so nothing was deleted." };
      }
      if (res.ok || res.status === 404) return { ok: true };
      let code = "";
      try {
        code = String(((await res.json()) as { error?: unknown }).error ?? "");
      } catch {
        /* no body */
      }
      const reason = code === "in-use" || code === "in-trashed-board" ? code : code.startsWith("storage") ? "storage" : "failed";
      return { ok: false, reason, message: MESSAGES[code] ?? "Couldn't delete it. Nothing was removed." };
    },
  };
}
