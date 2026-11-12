import * as Y from "yjs";
import { passwordHasher } from "@/lib/share/password";
import { generateToken } from "@/lib/share/token";
import { toSummary, validateLinkOptions, validateLinkPatch, type ValidationContext } from "@/lib/share/options";
import type { LinkRow } from "@/lib/share/link";
import { jsonResponse, readJsonLimited } from "./http";
import { requireOwner, responseFromError } from "./owner";
import { getShareStore, type LinkUpdate, type ShareStore } from "./share-store";
import { assertAppOrigin, siteOrigin } from "./site-url";
import { isGuid } from "./boards";

/*
 * The owner's side of share links: list, create, change, revoke, delete. Every function takes the owner id that
 * `requireOwner` verified and passes it to the store, which filters on it (another owner's link is simply "not found").
 * The plaintext token exists in exactly two places: the creation response, and the owner's clipboard.
 */

export const MAX_LINKS_PER_BOARD = 200;
const MAX_BODY = 8 * 1024;

const notFound = () => jsonResponse(404, { error: "not-found" });

function frameIdsIn(state: Uint8Array | null): string[] {
  if (!state) return [];
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, state);
    const out: string[] = [];
    for (const [id, obj] of doc.getMap("objects")) {
      if (obj instanceof Y.Map && obj.get("type") === "frame") out.push(id);
    }
    return out;
  } catch {
    return [];
  } finally {
    doc.destroy();
  }
}

/** What the options are checked against: the board's rounds (newest first) and its frames, live and as of the chosen round. */
async function contextFor(store: ShareStore, boardId: string, now: Date, roundId?: unknown): Promise<ValidationContext> {
  const rounds = await store.listRounds(boardId);
  const chosen = typeof roundId === "string" ? rounds.find((r) => r.id === roundId) : undefined;
  const frames = new Set(frameIdsIn(await store.getLiveState(boardId)));
  const asOf = chosen ?? rounds[0];
  if (asOf) for (const id of frameIdsIn(await store.getSnapshotState(asOf.snapshotId, boardId))) frames.add(id);
  return { now, roundIds: rounds.map((r) => r.id), frameIds: [...frames] };
}

async function ownedBoard(store: ShareStore, boardId: string, ownerId: string): Promise<boolean> {
  if (!isGuid(boardId)) return false;
  const board = await store.getBoard(boardId);
  return board !== null && board.ownerId.toLowerCase() === ownerId.toLowerCase();
}

type Ctx<K extends string> = { params: Promise<Record<K, string>> };

/** GET /api/boards/[id]/share-links -> { links: ShareLinkSummary[] } */
export async function listForBoard(_req: Request, { params }: Ctx<"id">): Promise<Response> {
  try {
    const { userId } = await requireOwner();
    const { id } = await params;
    const store = getShareStore();
    if (!(await ownedBoard(store, id, userId))) return notFound();
    const now = new Date();
    const links = await store.listLinks(id, userId);
    return jsonResponse(200, { links: links.map((l) => toSummary(l, now)) });
  } catch (e) {
    return responseFromError(e);
  }
}

/** POST /api/boards/[id]/share-links ShareLinkOptions -> 201 { link, url }: the only time the token is returned. */
export async function createForBoard(req: Request, { params }: Ctx<"id">): Promise<Response> {
  try {
    assertAppOrigin(req);
    const { userId } = await requireOwner();
    const { id } = await params;
    const store = getShareStore();
    if (!(await ownedBoard(store, id, userId))) return notFound();

    const raw = await readJsonLimited(req, MAX_BODY);
    const now = new Date();
    const ctx = await contextFor(store, id, now, (raw as { roundId?: unknown } | null)?.roundId);
    const checked = validateLinkOptions(raw, ctx);
    if (!checked.ok) return jsonResponse(400, { error: "invalid-options", errors: checked.errors });
    const options = checked.value;

    if ((await store.listLinks(id, userId)).length >= MAX_LINKS_PER_BOARD) return jsonResponse(409, { error: "too-many-links" });

    const { token, hash } = generateToken();
    const { password, ...rest } = options;
    const row = await store.insertLink({
      ...rest,
      boardId: id,
      ownerId: userId,
      tokenHash: hash,
      passwordHash: password === null ? null : await passwordHasher.hash(password),
    });
    return jsonResponse(201, { link: toSummary(row, now), url: `${siteOrigin(req)}/s/${token}` });
  } catch (e) {
    return responseFromError(e);
  }
}

async function ownedLink(store: ShareStore, id: string, ownerId: string): Promise<LinkRow | null> {
  if (!isGuid(id)) return null;
  const link = await store.getLink(id);
  return link && link.ownerId.toLowerCase() === ownerId.toLowerCase() ? link : null;
}

/** PATCH /api/share-links/[id] Partial<ShareLinkOptions> & { votesRevealed? } -> ShareLinkSummary */
export async function patchLink(req: Request, { params }: Ctx<"id">): Promise<Response> {
  try {
    assertAppOrigin(req);
    const { userId } = await requireOwner();
    const { id } = await params;
    const store = getShareStore();
    const current = await ownedLink(store, id, userId);
    if (!current) return notFound();

    const raw = await readJsonLimited(req, MAX_BODY);
    const now = new Date();
    const ctx = await contextFor(store, current.boardId, now, (raw as { roundId?: unknown } | null)?.roundId);
    const checked = validateLinkPatch(raw, ctx, current);
    if (!checked.ok) return jsonResponse(400, { error: "invalid-options", errors: checked.errors });

    const { password, ...fields } = checked.value;
    const update: LinkUpdate = { ...fields };
    if (password !== undefined) {
      update.passwordHash = password === null ? null : await passwordHasher.hash(password);
      update.bumpEpoch = true; // a new or removed password ends every session that used the old gate
    }
    const row = await store.updateLink(id, userId, update);
    return row ? jsonResponse(200, toSummary(row, now)) : notFound();
  } catch (e) {
    return responseFromError(e);
  }
}

/** POST /api/share-links/[id]/revoke -> ShareLinkSummary. Immediate: the guard checks revokedAt on every visitor request. */
export async function revokeLink(req: Request, { params }: Ctx<"id">): Promise<Response> {
  try {
    assertAppOrigin(req);
    const { userId } = await requireOwner();
    const { id } = await params;
    if (!isGuid(id)) return notFound();
    const now = new Date();
    const row = await getShareStore().revokeLink(id, userId, now);
    return row ? jsonResponse(200, toSummary(row, now)) : notFound();
  } catch (e) {
    return responseFromError(e);
  }
}

/** DELETE /api/share-links/[id] -> 204. Visitors, reactions, approvals and views of the link go with it. */
export async function deleteLink(req: Request, { params }: Ctx<"id">): Promise<Response> {
  try {
    assertAppOrigin(req);
    const { userId } = await requireOwner();
    const { id } = await params;
    if (!isGuid(id)) return notFound();
    return (await getShareStore().deleteLink(id, userId)) ? jsonResponse(204, null) : notFound();
  } catch (e) {
    return responseFromError(e);
  }
}

