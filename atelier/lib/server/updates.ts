import { bytesToPgBytea, pgByteaToBytes } from "@/lib/sync/bytes";
import type { AtelierServerClient } from "@/lib/supabase/server";

/** Largest accepted update body (SPEC §9: the server rejects oversized payloads). */
export const MAX_UPDATE_BYTES = 1024 * 1024;
/** Rows returned per read; the client asks again while `more` is true. */
export const READ_PAGE = 250;

export type UpdateRow = { seq: number; update: Uint8Array; createdAt: string };
export type SnapshotRow = { id: string; state: Uint8Array; uptoSeq: number; createdAt: string; kind: "compaction" | "round" };

/** What sync and compaction need from the database. The real one is below; tests use it over an in-memory client too. */
export interface UpdatesDb {
  boardExists(boardId: string): Promise<boolean>;
  insertUpdate(boardId: string, update: Uint8Array, deviceId: string): Promise<number>;
  /** Rows with seq > afterSeq, ascending. */
  updatesAfter(boardId: string, afterSeq: number, limit: number): Promise<UpdateRow[]>;
  countUpdates(boardId: string): Promise<number>;
  /** The snapshot covering the most seqs (null when there is none). */
  latestSnapshot(boardId: string): Promise<SnapshotRow | null>;
  insertSnapshot(boardId: string, state: Uint8Array, uptoSeq: number, kind: "compaction"): Promise<string>;
  deleteUpdatesUpTo(boardId: string, seq: number): Promise<void>;
  /** Drop older compaction versions: same-day ones the new snapshot supersedes, and ones past the history window. */
  pruneSnapshots(boardId: string, p: { keepId: string; uptoSeq: number; dayStart: string; historyCutoff: string }): Promise<void>;
}

function fail(what: string, error: { message?: string } | null): never {
  // The message stays in server logs only; routes answer with a generic error.
  throw new Error(`${what}: ${error?.message ?? "unknown error"}`);
}

export function supabaseUpdatesDb(supabase: AtelierServerClient): UpdatesDb {
  return {
    async boardExists(boardId) {
      const { data, error } = await supabase.from("boards").select("id").eq("id", boardId).maybeSingle();
      if (error) fail("board lookup", error);
      return data !== null;
    },

    async insertUpdate(boardId, update, deviceId) {
      const { data, error } = await supabase
        .from("board_updates")
        .insert({ board_id: boardId, update: bytesToPgBytea(update), device_id: deviceId })
        .select("seq")
        .single();
      if (error || !data) fail("insert update", error);
      return Number((data as { seq: number }).seq);
    },

    async updatesAfter(boardId, afterSeq, limit) {
      const { data, error } = await supabase
        .from("board_updates")
        .select("seq, update, created_at")
        .eq("board_id", boardId)
        .gt("seq", afterSeq)
        .order("seq", { ascending: true })
        .limit(limit);
      if (error) fail("read updates", error);
      return (data ?? []).map((r) => ({ seq: Number(r.seq), update: pgByteaToBytes(r.update), createdAt: r.created_at }));
    },

    async countUpdates(boardId) {
      const { count, error } = await supabase.from("board_updates").select("seq", { count: "exact", head: true }).eq("board_id", boardId);
      if (error) fail("count updates", error);
      return count ?? 0;
    },

    async latestSnapshot(boardId) {
      const { data, error } = await supabase
        .from("board_snapshots")
        .select("id, state, upto_seq, kind, created_at")
        .eq("board_id", boardId)
        .order("upto_seq", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) fail("read snapshot", error);
      if (!data) return null;
      return { id: data.id, state: pgByteaToBytes(data.state), uptoSeq: Number(data.upto_seq), createdAt: data.created_at, kind: data.kind };
    },

    async insertSnapshot(boardId, state, uptoSeq, kind) {
      const { data, error } = await supabase
        .from("board_snapshots")
        .insert({ board_id: boardId, state: bytesToPgBytea(state), upto_seq: uptoSeq, kind })
        .select("id")
        .single();
      if (error || !data) fail("insert snapshot", error);
      return (data as { id: string }).id;
    },

    async deleteUpdatesUpTo(boardId, seq) {
      const { error } = await supabase.from("board_updates").delete().eq("board_id", boardId).lte("seq", seq);
      if (error) fail("delete merged updates", error);
    },

    async pruneSnapshots(boardId, p) {
      // Never a snapshot that covers more than the new one (a concurrent compaction may have gone further), never rounds.
      const sameDay = await supabase
        .from("board_snapshots")
        .delete()
        .eq("board_id", boardId)
        .eq("kind", "compaction")
        .neq("id", p.keepId)
        .lte("upto_seq", p.uptoSeq)
        .gte("created_at", p.dayStart);
      if (sameDay.error) fail("prune snapshots", sameDay.error);
      const old = await supabase
        .from("board_snapshots")
        .delete()
        .eq("board_id", boardId)
        .eq("kind", "compaction")
        .neq("id", p.keepId)
        .lte("upto_seq", p.uptoSeq)
        .lt("created_at", p.historyCutoff);
      if (old.error) fail("prune snapshots", old.error);
    },
  };
}

/** Store one update; returns its seq. */
export async function appendUpdate(db: UpdatesDb, boardId: string, update: Uint8Array, deviceId: string): Promise<number> {
  return db.insertUpdate(boardId, update, deviceId);
}

export type ReadResult = {
  snapshot?: { state: Uint8Array; uptoSeq: number };
  updates: { seq: number; update: Uint8Array }[];
  more: boolean;
};

/**
 * Everything a device needs to catch up from `afterSeq`. A device that is behind the newest snapshot (the rows it
 * missed were merged away) gets the snapshot first, then the rows after it.
 */
export async function readUpdates(db: UpdatesDb, boardId: string, afterSeq: number, limit = READ_PAGE): Promise<ReadResult> {
  const snap = await db.latestSnapshot(boardId);
  const from = snap && afterSeq < snap.uptoSeq ? snap.uptoSeq : afterSeq;
  const rows = await db.updatesAfter(boardId, from, limit + 1);
  const more = rows.length > limit;
  const updates = rows.slice(0, limit).map(({ seq, update }) => ({ seq, update }));
  return snap && afterSeq < snap.uptoSeq ? { snapshot: { state: snap.state, uptoSeq: snap.uptoSeq }, updates, more } : { updates, more };
}
