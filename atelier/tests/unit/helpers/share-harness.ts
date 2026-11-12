import * as Y from "yjs";
import { MemoryShareStore } from "@/lib/server/share-store-memory";
import { createSupabaseShareStoreWith } from "@/lib/server/share-store-supabase";
import { bytesToPgBytea } from "@/lib/sync/bytes";
import type { ShareStore } from "@/lib/server/share-store";
import type { Round } from "@/lib/share/round-types";
import { createFakePg } from "./fake-pg";

export type SeedBoard = { id: string; ownerId: string; title?: string; deletedAt?: string | null };
export type SeedAsset = { id: string; kind?: "image" | "video" | "gif" | "file"; width?: number | null; height?: number | null; variants?: unknown; source_url?: string | null; credit?: string | null; licence?: string | null };

/** One store plus the ways to put boards, rounds and assets behind it, so a contract test runs against every implementation. */
export interface ShareHarness {
  name: string;
  /** The implementation removes a deleted link's children itself (the real database does it with ON DELETE CASCADE). */
  cascades: boolean;
  store: ShareStore;
  clock: { now: Date };
  seedBoard(b: SeedBoard): void;
  seedSnapshot(boardId: string, snapshotId: string, state: Uint8Array): void;
  seedRound(r: Round): void;
  seedLive(boardId: string, state: Uint8Array): void;
  seedAsset(a: SeedAsset): void;
}

export function memoryHarness(): ShareHarness {
  const clock = { now: new Date("2026-11-12T10:00:00Z") };
  const store = new MemoryShareStore({ now: () => clock.now });
  return {
    name: "memory",
    cascades: true,
    store,
    clock,
    seedBoard: (b) => store.seedBoard(b),
    seedSnapshot: (boardId, id, state) => store.seedSnapshot(boardId, id, state),
    seedRound: (r) => store.seedRound(r),
    seedLive: (boardId, state) => store.seedLiveState(boardId, state),
    seedAsset: (a) => store.seedAsset(a),
  };
}

/** The Supabase store over the in-memory PostgREST stand-in (service role: it acts as no particular owner). */
export function supabaseHarness(): ShareHarness {
  const clock = { now: new Date("2026-11-12T10:00:00Z") };
  const pg = createFakePg();
  for (const t of ["rounds", "share_links", "visitors", "share_auth_attempts"]) pg.tables[t] = [];
  const store = createSupabaseShareStoreWith(pg.client({ role: "service_role" }) as never, () => clock.now);
  let seq = 0;
  const iso = () => clock.now.toISOString();
  return {
    name: "supabase",
    cascades: false,
    store,
    clock,
    seedBoard: (b) => {
      pg.tables.boards.push({ id: b.id, owner_id: b.ownerId, title: b.title ?? "Untitled", deleted_at: b.deletedAt ?? null, created_at: iso(), updated_at: iso() });
    },
    seedSnapshot: (boardId, id, state) => {
      pg.tables.board_snapshots.push({ id, board_id: boardId, state: bytesToPgBytea(state), upto_seq: ++seq, kind: "round", created_at: iso() });
    },
    seedRound: (r) => {
      pg.tables.rounds.push({ id: r.id, board_id: r.boardId, number: r.number, label: r.label, snapshot_id: r.snapshotId, previews: r.previews, diff: r.diff, published_at: r.publishedAt });
    },
    seedLive: (boardId, state) => {
      pg.tables.board_updates.push({ board_id: boardId, seq: ++seq, update: bytesToPgBytea(state), device_id: "d", created_at: iso() });
    },
    seedAsset: (a) => {
      pg.tables.assets.push({
        id: a.id, owner_id: "o", kind: a.kind ?? "image", mime: "image/webp", width: a.width === undefined ? 100 : a.width, height: a.height === undefined ? 50 : a.height,
        variants: a.variants ?? { w1024: true }, source_url: a.source_url ?? null, credit: a.credit ?? null, licence: a.licence ?? null,
      });
    },
  };
}

/** A tiny Yjs state, for tests that only need "some bytes that decode". */
export function emptyState(): Uint8Array {
  const doc = new Y.Doc();
  doc.getMap("meta").set("title", "t");
  return Y.encodeStateAsUpdate(doc);
}
