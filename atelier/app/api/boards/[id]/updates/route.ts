import * as Y from "yjs";
import { maybeCompact } from "@/lib/server/compaction";
import { requireOwner, responseFromError } from "@/lib/server/owner";
import { appendUpdate, MAX_UPDATE_BYTES, readUpdates, supabaseUpdatesDb } from "@/lib/server/updates";
import { bytesToBase64 } from "@/lib/sync/bytes";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEVICE = /^[A-Za-z0-9_-]{1,64}$/;

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

type Ctx = { params: Promise<{ id: string }> };

/** Reads at most `max` bytes of the body; null when there are more. */
async function readCapped(request: Request, max: number): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** Catch up: GET ?after=N returns the updates after seq N (or the snapshot first when N predates it). */
export async function GET(request: Request, { params }: Ctx): Promise<Response> {
  let auth;
  try {
    auth = await requireOwner();
  } catch (e) {
    return responseFromError(e);
  }
  const { id } = await params;
  if (!UUID.test(id)) return json(404, { error: "not-found" });

  const raw = new URL(request.url).searchParams.get("after") ?? "0";
  const after = /^\d{1,15}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(after)) return json(400, { error: "bad-request" });

  try {
    const db = supabaseUpdatesDb(auth.supabase);
    if (!(await db.boardExists(id))) return json(404, { error: "not-found" });
    const result = await readUpdates(db, id, after);
    return json(200, {
      ...(result.snapshot ? { snapshot: { state: bytesToBase64(result.snapshot.state), uptoSeq: result.snapshot.uptoSeq } } : {}),
      updates: result.updates.map((u) => ({ seq: u.seq, update: bytesToBase64(u.update) })),
      more: result.more,
    });
  } catch (e) {
    console.error("updates GET failed", e);
    return json(500, { error: "server-error" });
  }
}

/** Store one batched update (octet-stream, at most 1 MB) for a board the caller owns. */
export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  let auth;
  try {
    auth = await requireOwner();
  } catch (e) {
    return responseFromError(e);
  }
  const { id } = await params;
  if (!UUID.test(id)) return json(404, { error: "not-found" });

  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/octet-stream")) {
    return json(415, { error: "unsupported-type" });
  }
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_UPDATE_BYTES) return json(413, { error: "too-large" });

  try {
    const db = supabaseUpdatesDb(auth.supabase);
    if (!(await db.boardExists(id))) return json(404, { error: "not-found" });

    const body = await readCapped(request, MAX_UPDATE_BYTES);
    if (body === null) return json(413, { error: "too-large" });
    if (body.byteLength < 2) return json(400, { error: "bad-request" });
    try {
      Y.decodeUpdate(body); // throws on anything that is not a Yjs update
    } catch {
      return json(400, { error: "bad-request" });
    }

    const device = request.headers.get("x-atelier-device") ?? "";
    const seq = await appendUpdate(db, id, body, DEVICE.test(device) ? device : "unknown");

    // Housekeeping must never fail a save: the update is already stored.
    try {
      await maybeCompact(db, id);
    } catch (e) {
      console.warn("compaction failed", e);
    }
    return json(200, { seq });
  } catch (e) {
    console.error("updates POST failed", e);
    return json(500, { error: "server-error" });
  }
}
