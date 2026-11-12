import * as Y from "yjs";
import { isAssetId } from "@/lib/assets/asset-id";
import { lockSeconds } from "@/lib/share/backoff";
import type { LinkRow } from "@/lib/share/link";
import { EMPTY_ROUND_DIFF, type Round, type RoundDiff } from "@/lib/share/round-types";
import { createServiceClient } from "@/lib/supabase/service";
import type { AtelierServerClient } from "@/lib/supabase/server";
import type { RoundRow, ShareLinkRow, VisitorRow } from "@/lib/supabase/types";
import { pgByteaToBytes } from "@/lib/sync/bytes";
import { RoundNumberTakenError, type AttemptState, type LinkUpdate, type NewLink, type ShareStore, type StoreBoard, type ViewerAssetRow, type Visitor } from "./share-store";
import { loadBoardState } from "./state";
import { supabaseUpdatesDb, type SnapshotMeta } from "./updates";

/*
 * The ShareStore over the service-role Supabase client. The service role bypasses RLS, so every method that takes an
 * owner id filters on it explicitly, and every lookup by id first checks the id's shape (a malformed uuid would be a
 * database error, which must never become a way to tell links apart). Errors carry the table and the database's message
 * for server logs; routes answer with a generic body.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

const ATTEMPT_FORGET_MS = 60 * 60 * 1000;
const ASSET_CHUNK = 100;
const UPDATE_BATCH = 500;
const MAX_BATCHES = 400; // 200,000 updates: a board that needs more is compacted long before

function fail(what: string, error: { message?: string } | null): never {
  throw new Error(`share store, ${what}: ${error?.message ?? "unknown error"}`);
}

// ---- row mapping ---------------------------------------------------------------------------------------

export function linkFromRow(r: ShareLinkRow): LinkRow {
  return {
    id: r.id,
    boardId: r.board_id,
    ownerId: r.owner_id,
    name: r.name ?? "",
    tokenHash: r.token_hash,
    mode: r.mode,
    roundId: r.round_id,
    scope: r.scope,
    frameIds: Array.isArray(r.frame_ids) ? r.frame_ids.filter((f): f is string => typeof f === "string") : [],
    permission: r.permission,
    passwordHash: r.password_hash,
    expiresAt: r.expires_at,
    welcomeNote: r.welcome_note ?? "",
    allowDownload: r.allow_download === true,
    watermark: r.watermark === true,
    showCredits: r.show_credits === true,
    blindVotes: r.blind_votes === true,
    votesRevealed: r.votes_revealed === true,
    cookieEpoch: Number(r.cookie_epoch) || 0,
    createdAt: r.created_at,
    revokedAt: r.revoked_at,
  };
}

const LINK_COLUMNS: Record<string, keyof ShareLinkRow> = {
  name: "name",
  mode: "mode",
  roundId: "round_id",
  scope: "scope",
  frameIds: "frame_ids",
  permission: "permission",
  passwordHash: "password_hash",
  expiresAt: "expires_at",
  welcomeNote: "welcome_note",
  allowDownload: "allow_download",
  watermark: "watermark",
  showCredits: "show_credits",
  blindVotes: "blind_votes",
  votesRevealed: "votes_revealed",
  revokedAt: "revoked_at",
};

function patchToColumns(patch: Omit<LinkUpdate, "bumpEpoch">): Partial<ShareLinkRow> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const column = LINK_COLUMNS[key];
    if (column && value !== undefined) out[column] = value;
  }
  return out as Partial<ShareLinkRow>;
}

function visitorFromRow(r: VisitorRow): Visitor {
  return { id: r.id, linkId: r.share_link_id, displayName: r.display_name, createdAt: r.created_at, lastSeenAt: r.last_seen_at, lastRoundId: r.last_round_id };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function diffFromJson(v: unknown): RoundDiff {
  if (!isObject(v)) return { ...EMPTY_ROUND_DIFF, byFrame: {} };
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is string => typeof i === "string") : []);
  const byFrame: RoundDiff["byFrame"] = {};
  if (isObject(v.byFrame)) {
    for (const [k, c] of Object.entries(v.byFrame)) {
      if (!isObject(c)) continue;
      byFrame[k] = { added: Number(c.added) || 0, changed: Number(c.changed) || 0, removed: Number(c.removed) || 0 };
    }
  }
  return { added: list(v.added), removed: list(v.removed), changed: list(v.changed), byFrame, truncated: v.truncated === true };
}

export function roundFromRow(r: RoundRow): Round {
  const previews: Round["previews"] = {};
  if (isObject(r.previews)) {
    for (const [frameId, p] of Object.entries(r.previews)) {
      if (isObject(p) && typeof p.w480 === "string" && typeof p.w1280 === "string") {
        previews[frameId] = { w480: p.w480, w1280: p.w1280, w: Number(p.w) || 0, h: Number(p.h) || 0 };
      }
    }
  }
  return {
    id: r.id,
    boardId: r.board_id,
    number: r.number,
    label: r.label ?? `Round ${r.number}`,
    snapshotId: r.snapshot_id,
    previews,
    diff: diffFromJson(r.diff),
    publishedAt: r.published_at,
  };
}

// ---- the store -----------------------------------------------------------------------------------------

export function createSupabaseShareStoreWith(db: AtelierServerClient, now: () => Date = () => new Date()): ShareStore {
  const updatesDb = supabaseUpdatesDb(db);

  async function ownedLink(id: string, ownerId: string): Promise<LinkRow | null> {
    if (!isUuid(id) || !isUuid(ownerId)) return null;
    const { data, error } = await db.from("share_links").select("*").eq("id", id).eq("owner_id", ownerId).maybeSingle();
    if (error) fail("read link", error);
    return data ? linkFromRow(data as ShareLinkRow) : null;
  }

  async function writeLink(id: string, ownerId: string, columns: Partial<ShareLinkRow>): Promise<LinkRow | null> {
    const { data, error } = await db.from("share_links").update(columns).eq("id", id).eq("owner_id", ownerId).select("*").maybeSingle();
    if (error) fail("update link", error);
    return data ? linkFromRow(data as ShareLinkRow) : null;
  }

  return {
    async insertLink(row: NewLink) {
      const { data, error } = await db
        .from("share_links")
        .insert({
          id: crypto.randomUUID(),
          board_id: row.boardId,
          owner_id: row.ownerId,
          name: row.name,
          token_hash: row.tokenHash,
          mode: row.mode,
          round_id: row.roundId,
          scope: row.scope,
          frame_ids: row.frameIds,
          permission: row.permission,
          password_hash: row.passwordHash,
          expires_at: row.expiresAt,
          welcome_note: row.welcomeNote,
          allow_download: row.allowDownload,
          watermark: row.watermark,
          show_credits: row.showCredits,
          blind_votes: row.blindVotes,
          votes_revealed: false,
          cookie_epoch: 0,
          revoked_at: null,
          created_at: now().toISOString(),
        })
        .select("*")
        .single();
      if (error || !data) fail("insert link", error);
      return linkFromRow(data as ShareLinkRow);
    },

    async getLinkByHash(tokenHash) {
      if (typeof tokenHash !== "string" || tokenHash.length > 128) return null;
      const { data, error } = await db.from("share_links").select("*").eq("token_hash", tokenHash).maybeSingle();
      if (error) fail("read link", error);
      return data ? linkFromRow(data as ShareLinkRow) : null;
    },

    async getLink(id) {
      if (!isUuid(id)) return null;
      const { data, error } = await db.from("share_links").select("*").eq("id", id).maybeSingle();
      if (error) fail("read link", error);
      return data ? linkFromRow(data as ShareLinkRow) : null;
    },

    async listLinks(boardId, ownerId) {
      if (!isUuid(boardId) || !isUuid(ownerId)) return [];
      const { data, error } = await db.from("share_links").select("*").eq("board_id", boardId).eq("owner_id", ownerId).order("created_at", { ascending: false });
      if (error) fail("list links", error);
      return (data ?? []).map((r) => linkFromRow(r as ShareLinkRow));
    },

    async updateLink(id, ownerId, patch) {
      const current = await ownedLink(id, ownerId);
      if (!current) return null;
      const { bumpEpoch, ...fields } = patch;
      const columns = patchToColumns(fields);
      if (bumpEpoch) columns.cookie_epoch = current.cookieEpoch + 1;
      if (Object.keys(columns).length === 0) return current;
      return writeLink(id, ownerId, columns);
    },

    async revokeLink(id, ownerId, at) {
      const current = await ownedLink(id, ownerId);
      if (!current) return null;
      return writeLink(id, ownerId, { revoked_at: current.revokedAt ?? at.toISOString(), cookie_epoch: current.cookieEpoch + 1 });
    },

    async deleteLink(id, ownerId) {
      if (!isUuid(id) || !isUuid(ownerId)) return false;
      // Visitors, reactions, approvals, views and attempts go with the link (ON DELETE CASCADE).
      const { data, error } = await db.from("share_links").delete().eq("id", id).eq("owner_id", ownerId).select("id");
      if (error) fail("delete link", error);
      return (data ?? []).length > 0;
    },

    async listRounds(boardId) {
      if (!isUuid(boardId)) return [];
      const { data, error } = await db.from("rounds").select("*").eq("board_id", boardId).order("number", { ascending: false });
      if (error) fail("list rounds", error);
      return (data ?? []).map((r) => roundFromRow(r as RoundRow));
    },

    async getRound(id) {
      if (!isUuid(id)) return null;
      const { data, error } = await db.from("rounds").select("*").eq("id", id).maybeSingle();
      if (error) fail("read round", error);
      return data ? roundFromRow(data as RoundRow) : null;
    },

    async latestRound(boardId) {
      if (!isUuid(boardId)) return null;
      const { data, error } = await db.from("rounds").select("*").eq("board_id", boardId).order("number", { ascending: false }).limit(1);
      if (error) fail("read latest round", error);
      const row = (data ?? [])[0];
      return row ? roundFromRow(row as RoundRow) : null;
    },

    async snapshotBoard(boardId, kind, label) {
      if (!isUuid(boardId)) throw new Error("share store, snapshot: bad board id");
      const { state, uptoSeq } = await loadBoardState(boardId, updatesDb);
      const id = await updatesDb.insertSnapshot(boardId, state, uptoSeq, kind, { label, createdAt: now().toISOString() });
      return { id, uptoSeq, state };
    },

    async deleteSnapshot(id, boardId) {
      if (!isUuid(id) || !isUuid(boardId)) return;
      // A round's snapshot is referenced by its row (foreign key): the database refuses, which is the point.
      const { error } = await db.from("board_snapshots").delete().eq("id", id).eq("board_id", boardId);
      if (error) fail("delete snapshot", error);
    },

    async listSnapshots(boardId): Promise<SnapshotMeta[]> {
      if (!isUuid(boardId)) return [];
      return (await updatesDb.listSnapshots(boardId)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.uptoSeq - a.uptoSeq));
    },

    async insertRound(row) {
      const { data, error } = await db
        .from("rounds")
        .insert({
          id: crypto.randomUUID(),
          board_id: row.boardId,
          number: row.number,
          label: row.label,
          snapshot_id: row.snapshotId,
          previews: row.previews as never,
          diff: row.diff as never,
          published_at: now().toISOString(),
        })
        .select("*")
        .single();
      if (error?.code === "23505") throw new RoundNumberTakenError(row.boardId, row.number);
      if (error || !data) fail("insert round", error);
      return roundFromRow(data as RoundRow);
    },

    async createVisitor(linkId, ipHash) {
      const at = now().toISOString();
      const { data, error } = await db
        .from("visitors")
        .insert({ id: crypto.randomUUID(), share_link_id: linkId, ip_hash: ipHash, created_at: at, last_seen_at: at, last_round_id: null, display_name: null })
        .select("*")
        .single();
      if (error || !data) fail("insert visitor", error);
      return visitorFromRow(data as VisitorRow);
    },

    async getVisitor(id) {
      if (!isUuid(id)) return null;
      const { data, error } = await db.from("visitors").select("*").eq("id", id).maybeSingle();
      if (error) fail("read visitor", error);
      return data ? visitorFromRow(data as VisitorRow) : null;
    },

    async setVisitorName(id, name) {
      if (!isUuid(id)) return;
      const { error } = await db.from("visitors").update({ display_name: name }).eq("id", id);
      if (error) fail("name visitor", error);
    },

    async touchVisitor(id, patch) {
      if (!isUuid(id)) return;
      const columns: Partial<VisitorRow> = { last_seen_at: now().toISOString() };
      if (patch.lastRoundId !== undefined) columns.last_round_id = patch.lastRoundId;
      const { error } = await db.from("visitors").update(columns).eq("id", id);
      if (error) fail("touch visitor", error);
    },

    async countVisitors(linkId) {
      if (!isUuid(linkId)) return 0;
      const { count, error } = await db.from("visitors").select("id", { count: "exact", head: true }).eq("share_link_id", linkId);
      if (error) fail("count visitors", error);
      return count ?? 0;
    },

    async countRecentVisitors(linkId, ipHash, since) {
      if (!isUuid(linkId)) return 0;
      const { count, error } = await db
        .from("visitors")
        .select("id", { count: "exact", head: true })
        .eq("share_link_id", linkId)
        .eq("ip_hash", ipHash)
        .gte("created_at", since.toISOString());
      if (error) fail("count recent visitors", error);
      return count ?? 0;
    },

    async getAttempt(linkId, ipHash): Promise<AttemptState | null> {
      if (!isUuid(linkId)) return null;
      const { data, error } = await db.from("share_auth_attempts").select("fails, locked_until").eq("share_link_id", linkId).eq("ip_hash", ipHash).maybeSingle();
      if (error) fail("read attempts", error);
      return data ? { fails: Number(data.fails) || 0, lockedUntil: data.locked_until } : null;
    },

    async recordFailure(linkId, ipHash, at): Promise<AttemptState> {
      const { data: prev, error: readError } = await db.from("share_auth_attempts").select("fails, updated_at").eq("share_link_id", linkId).eq("ip_hash", ipHash).maybeSingle();
      if (readError) fail("read attempts", readError);
      const fresh = prev && at.getTime() - Date.parse(prev.updated_at) <= ATTEMPT_FORGET_MS;
      const fails = (fresh ? Number(prev.fails) || 0 : 0) + 1;
      const lock = lockSeconds(fails);
      const lockedUntil = lock > 0 ? new Date(at.getTime() + lock * 1000).toISOString() : null;
      const columns = { fails, locked_until: lockedUntil, updated_at: at.toISOString() };
      const write = prev
        ? await db.from("share_auth_attempts").update(columns).eq("share_link_id", linkId).eq("ip_hash", ipHash)
        : await db.from("share_auth_attempts").insert({ share_link_id: linkId, ip_hash: ipHash, ...columns });
      if (write.error) fail("record attempt", write.error);
      return { fails, lockedUntil };
    },

    async clearAttempts(linkId, ipHash) {
      if (!isUuid(linkId)) return;
      const { error } = await db.from("share_auth_attempts").delete().eq("share_link_id", linkId).eq("ip_hash", ipHash);
      if (error) fail("clear attempts", error);
    },

    async getBoard(boardId): Promise<StoreBoard | null> {
      if (!isUuid(boardId)) return null;
      const { data, error } = await db.from("boards").select("id, owner_id, title, deleted_at").eq("id", boardId).maybeSingle();
      if (error) fail("read board", error);
      return data ? { id: data.id, ownerId: data.owner_id, title: data.title, deletedAt: data.deleted_at } : null;
    },

    async getBoardTitle(boardId) {
      return (await this.getBoard(boardId))?.title ?? null;
    },

    async getSnapshotState(snapshotId, boardId) {
      if (!isUuid(snapshotId) || !isUuid(boardId)) return null;
      const { data, error } = await db.from("board_snapshots").select("state").eq("id", snapshotId).eq("board_id", boardId).maybeSingle();
      if (error) fail("read snapshot", error);
      return data ? pgByteaToBytes(data.state) : null;
    },

    async getLiveState(boardId) {
      if (!isUuid(boardId)) return null;
      const doc = new Y.Doc();
      try {
        const snapshot = await updatesDb.latestSnapshot(boardId);
        let after = 0;
        let any = false;
        if (snapshot) {
          Y.applyUpdate(doc, snapshot.state);
          after = snapshot.uptoSeq;
          any = true;
        }
        for (let i = 0; i < MAX_BATCHES; i++) {
          const rows = await updatesDb.updatesAfter(boardId, after, UPDATE_BATCH);
          for (const r of rows) {
            try {
              Y.applyUpdate(doc, r.update);
              any = true;
            } catch {
              // an invalid row is skipped, exactly as compaction skips it
            }
            after = r.seq;
          }
          if (rows.length < UPDATE_BATCH) break;
        }
        return any ? Y.encodeStateAsUpdate(doc) : null;
      } finally {
        doc.destroy();
      }
    },

    async getAssets(ids): Promise<ViewerAssetRow[]> {
      const wanted = [...new Set(ids.filter(isAssetId))];
      const out: ViewerAssetRow[] = [];
      for (let i = 0; i < wanted.length; i += ASSET_CHUNK) {
        const { data, error } = await db
          .from("assets")
          .select("id, kind, width, height, variants, source_url, credit, licence")
          .in("id", wanted.slice(i, i + ASSET_CHUNK));
        if (error) fail("read assets", error);
        for (const r of (data ?? []) as ViewerAssetRow[]) {
          out.push({ id: r.id, kind: r.kind, width: r.width, height: r.height, variants: r.variants, source_url: r.source_url, credit: r.credit, licence: r.licence });
        }
      }
      return out;
    },
  };
}

/** The production store: service-role client from the environment, or null when Supabase is not configured. */
export function createSupabaseShareStore(): ShareStore | null {
  const db = createServiceClient();
  return db ? createSupabaseShareStoreWith(db) : null;
}
