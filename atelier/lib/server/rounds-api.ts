import { nanoid } from "nanoid";
import { jsonResponse, readJsonLimited } from "./http";
import { ownedLiveBoard, ownerOf } from "./owner-context";
import { isLocalOnly, responseFromError } from "./owner";
import { presignPreviewUploads } from "./r2";
import { createRateLimiter } from "./rate-limit";
import { PREVIEW_FRAME_ID, publishRound, type PreviewFrame } from "./rounds";
import { getShareStore, RoundNumberTakenError } from "./share-store";
import { assertAppOrigin } from "./site-url";
import { StateTooLargeError } from "./state";

/*
 * The owner's routes for publishing a round: `prepare` (presigned upload URLs for the frame preview images the browser rendered),
 * `create` (the round itself) and the list. Every handler checks, in this order: same origin (mutating calls), owner, board
 * ownership, rate limit, body size and shape. The state a round freezes is read from the server, never from the request.
 */

export const MAX_FRAMES = 100;
export const MAX_PREVIEW_BYTES = 3 * 1024 * 1024;
const MAX_BODY = 64 * 1024;

/** Per owner and per server instance (see rate-limit.ts): a runaway client or a stolen session cannot spin on these. */
export const roundLimits = {
  prepare: createRateLimiter({ limit: 30, windowMs: 60_000 }),
  publish: createRateLimiter({ limit: 10, windowMs: 60_000 }),
};

type Ctx = { params: Promise<{ id: string }> };

/** The limit for this owner. Local-only mode (development and end-to-end tests) has one shared owner and no account to abuse. */
const within = (limiter: ReturnType<typeof createRateLimiter>, userId: string) => (isLocalOnly() ? { ok: true, retryAfterSec: 0 } : limiter.hit(userId));

const notFound = () => jsonResponse(404, { error: "not-found" });
const bad = (error: string) => jsonResponse(400, { error });
const limited = (retryAfterSec: number) => jsonResponse(429, { error: "rate-limited" }, { headers: { "retry-after": String(retryAfterSec) } });

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** GET /api/boards/[id]/rounds -> { rounds: Round[] } (newest first). */
export async function listRoundsHandler(_req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { userId } = await ownerOf();
    const { id } = await params;
    const store = getShareStore();
    if (!(await ownedLiveBoard(store, id, userId))) return notFound();
    return jsonResponse(200, { rounds: await store.listRounds(id) });
  } catch (e) {
    return responseFromError(e);
  }
}

/** POST /api/boards/[id]/rounds/prepare { frames: { frameId, bytes1280, bytes480 }[] } -> { previewToken, uploads } */
export async function prepareHandler(req: Request, { params }: Ctx): Promise<Response> {
  try {
    assertAppOrigin(req);
    const { userId } = await ownerOf();
    const { id } = await params;
    const store = getShareStore();
    if (!(await ownedLiveBoard(store, id, userId))) return notFound();
    const hit = within(roundLimits.prepare, userId);
    if (!hit.ok) return limited(hit.retryAfterSec);

    const body = await readJsonLimited<unknown>(req, MAX_BODY);
    const frames = isObject(body) ? body.frames : undefined;
    if (!Array.isArray(frames)) return bad("invalid-frames");
    if (frames.length > MAX_FRAMES) return bad("too-many-frames");
    const seen = new Set<string>();
    for (const f of frames) {
      if (!isObject(f) || typeof f.frameId !== "string" || !PREVIEW_FRAME_ID.test(f.frameId) || seen.has(f.frameId)) return bad("invalid-frames");
      seen.add(f.frameId);
      for (const bytes of [f.bytes1280, f.bytes480]) {
        if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 1 || bytes > MAX_PREVIEW_BYTES) return bad("invalid-frames");
      }
    }

    const previewToken = nanoid(22);
    const uploads: Record<string, { w480: string; w1280: string }> = {};
    try {
      for (const frameId of seen) uploads[frameId] = presignPreviewUploads({ token: previewToken, frameId });
    } catch {
      return jsonResponse(503, { error: "not-configured" });
    }
    return jsonResponse(200, { previewToken, uploads });
  } catch (e) {
    return responseFromError(e);
  }
}

function parseFrames(raw: unknown): PreviewFrame[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_FRAMES) return null;
  const out: PreviewFrame[] = [];
  for (const f of raw) {
    if (!isObject(f) || typeof f.frameId !== "string" || typeof f.name !== "string" || typeof f.w !== "number" || typeof f.h !== "number") return null;
    out.push({ frameId: f.frameId, name: f.name.slice(0, 300), w: f.w, h: f.h });
  }
  return out;
}

/** POST /api/boards/[id]/rounds { label, previewToken, frames } -> 201 Round */
export async function publishHandler(req: Request, { params }: Ctx): Promise<Response> {
  try {
    assertAppOrigin(req);
    const { userId } = await ownerOf();
    const { id } = await params;
    const store = getShareStore();
    if (!(await ownedLiveBoard(store, id, userId))) return notFound();
    const hit = within(roundLimits.publish, userId);
    if (!hit.ok) return limited(hit.retryAfterSec);

    const body = await readJsonLimited<unknown>(req, MAX_BODY);
    if (!isObject(body)) return bad("invalid-body");
    const frames = parseFrames(body.frames);
    if (typeof body.label !== "string" || body.label.length > 2000 || (body.previewToken !== null && typeof body.previewToken !== "string") || !frames) return bad("invalid-body");

    try {
      const round = await publishRound({ boardId: id, ownerId: userId, label: body.label, previewToken: body.previewToken, frames }, store);
      return jsonResponse(201, round);
    } catch (e) {
      if (e instanceof StateTooLargeError) return jsonResponse(413, { error: "board-too-large" });
      if (e instanceof RoundNumberTakenError) return jsonResponse(409, { error: "round-conflict" });
      console.error("publish round failed", e);
      return jsonResponse(500, { error: "server-error" });
    }
  } catch (e) {
    return responseFromError(e);
  }
}
