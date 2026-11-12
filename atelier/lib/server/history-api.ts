import { HISTORY_DAYS } from "./compaction";
import { jsonResponse, readJsonLimited } from "./http";
import { ownedLiveBoard, ownerOf } from "./owner-context";
import { isLocalOnly, responseFromError } from "./owner";
import { createRateLimiter } from "./rate-limit";
import { cleanLabel } from "./rounds";
import { getShareStore } from "./share-store";
import { assertAppOrigin } from "./site-url";
import { StateTooLargeError } from "./state";
import type { HistoryVersion } from "@/lib/engine/rounds/client";

export type { HistoryVersion };

/*
 * The owner's routes for a board's version history: the list (compaction versions of the last 30 days plus every round), a
 * labelled safety snapshot of the current state, and the bytes of one snapshot. All owner-only and checked against the board in
 * the URL: a snapshot id of another board (even the owner's own) is simply "not found".
 */

const MAX_BODY = 4 * 1024;
const SNAPSHOT_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** Vercel answers up to 4.5 MB; a bigger body would fail in the platform with no explanation. */
export const MAX_DOWNLOAD_BYTES = 4_000_000;

export const historyLimits = { snapshot: createRateLimiter({ limit: 20, windowMs: 60_000 }) };

type Ctx = { params: Promise<{ id: string }> };
const notFound = () => jsonResponse(404, { error: "not-found" });

/** GET /api/boards/[id]/history (also /versions) -> { versions: HistoryVersion[] }, newest first. */
export async function historyHandler(_req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { userId } = await ownerOf();
    const { id } = await params;
    const store = getShareStore();
    if (!(await ownedLiveBoard(store, id, userId))) return notFound();

    const [snapshots, rounds] = await Promise.all([store.listSnapshots(id), store.listRounds(id)]);
    const cutoff = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const versions: HistoryVersion[] = [];
    for (const s of snapshots) {
      if (s.kind === "compaction" && s.createdAt >= cutoff) versions.push({ id: s.id, kind: "compaction", label: s.label, roundNumber: null, createdAt: s.createdAt, uptoSeq: s.uptoSeq });
    }
    const uptoOf = new Map(snapshots.map((s) => [s.id, s.uptoSeq]));
    for (const r of rounds) versions.push({ id: r.snapshotId, kind: "round", label: r.label, roundNumber: r.number, createdAt: r.publishedAt, uptoSeq: uptoOf.get(r.snapshotId) ?? 0 });
    versions.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.uptoSeq - a.uptoSeq));
    return jsonResponse(200, { versions });
  } catch (e) {
    return responseFromError(e);
  }
}

/** POST /api/boards/[id]/snapshots { label } -> 201 { id }: a snapshot of the current merged state ("Before restore"). */
export async function createSnapshotHandler(req: Request, { params }: Ctx): Promise<Response> {
  try {
    assertAppOrigin(req);
    const { userId } = await ownerOf();
    const { id } = await params;
    const store = getShareStore();
    if (!(await ownedLiveBoard(store, id, userId))) return notFound();
    const hit = (isLocalOnly() ? { ok: true, retryAfterSec: 0 } : historyLimits.snapshot.hit(userId));
    if (!hit.ok) return jsonResponse(429, { error: "rate-limited" }, { headers: { "retry-after": String(hit.retryAfterSec) } });

    const body = await readJsonLimited<unknown>(req, MAX_BODY);
    const raw = typeof body === "object" && body !== null && !Array.isArray(body) ? (body as { label?: unknown }).label : undefined;
    if (raw !== undefined && typeof raw !== "string") return jsonResponse(400, { error: "invalid-body" });
    try {
      const snap = await store.snapshotBoard(id, "compaction", cleanLabel(raw ?? "") || "Snapshot");
      return jsonResponse(201, { id: snap.id });
    } catch (e) {
      if (e instanceof StateTooLargeError) return jsonResponse(413, { error: "board-too-large" });
      console.error("snapshot failed", e);
      return jsonResponse(500, { error: "server-error" });
    }
  } catch (e) {
    return responseFromError(e);
  }
}

/** GET /api/boards/[id]/snapshots/[sid] -> the snapshot's Yjs state (application/octet-stream). */
export async function downloadSnapshotHandler(_req: Request, { params }: { params: Promise<{ id: string; sid: string }> }): Promise<Response> {
  try {
    const { userId } = await ownerOf();
    const { id, sid } = await params;
    const store = getShareStore();
    if (!(await ownedLiveBoard(store, id, userId)) || !SNAPSHOT_ID.test(sid)) return notFound();
    const state = await store.getSnapshotState(sid, id); // null unless the snapshot belongs to THIS board
    if (!state) return notFound();
    if (state.byteLength > MAX_DOWNLOAD_BYTES) return jsonResponse(413, { error: "too-large" });
    return new Response(state as BodyInit, {
      status: 200,
      headers: { "content-type": "application/octet-stream", "content-length": String(state.byteLength), "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
    });
  } catch (e) {
    return responseFromError(e);
  }
}
