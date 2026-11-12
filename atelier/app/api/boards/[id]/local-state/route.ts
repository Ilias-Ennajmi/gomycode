import { jsonResponse } from "@/lib/server/http";
import { isLocalOnly } from "@/lib/server/owner";
import { getShareStore } from "@/lib/server/share-store";
import { isLocalBoardId, LOCAL_OWNER_ID } from "@/lib/server/share-links";
import { MemoryShareStore } from "@/lib/server/share-store-memory";
import { assertAppOrigin } from "@/lib/server/site-url";

// PUT /api/boards/:id/local-state   (local-only mode only: development and end-to-end tests)
// Boards live in the browser there, so the server cannot see them. The Share dialog hands over the board's current Yjs state
// so a link made on this server has something to show and its frame list can be checked. Outside local-only mode this route
// does not exist (404): real boards reach the server through the sync routes.

const MAX_STATE_BYTES = 32 * 1024 * 1024;

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    if (!isLocalOnly()) return jsonResponse(404, { error: "not-found" });
    const { id } = await params;
    if (!isLocalBoardId(id)) return jsonResponse(404, { error: "not-found" });
    try {
      assertAppOrigin(req);
    } catch (e) {
      if (e instanceof Response) return e;
      throw e;
    }
    const store = getShareStore();
    if (!(store instanceof MemoryShareStore)) return jsonResponse(404, { error: "not-found" });

    const declared = Number(req.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_STATE_BYTES) return jsonResponse(413, { error: "too-large" });
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_STATE_BYTES) return jsonResponse(bytes.byteLength ? 413 : 400, { error: bytes.byteLength ? "too-large" : "invalid-body" });

    let title: string | undefined;
    try {
      const raw = req.headers.get("x-atelier-title");
      title = raw ? decodeURIComponent(raw).slice(0, 300) : undefined;
    } catch {
      title = undefined;
    }
    store.ensureBoard({ id, ownerId: LOCAL_OWNER_ID, title });
    store.replaceLiveState(id, bytes);
    return jsonResponse(204, null);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
