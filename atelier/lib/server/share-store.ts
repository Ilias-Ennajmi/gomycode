import type { LinkRow } from "@/lib/share/link";
import type { Round } from "@/lib/share/round-types";
import type { AssetRow } from "@/lib/supabase/types";
import { isLocalOnly } from "./owner";
import { MemoryShareStore } from "./share-store-memory";
import type { SnapshotMeta } from "./updates";
import { createSupabaseShareStore } from "./share-store-supabase";

export type { Action, LinkRow, ShareLinkSummary } from "@/lib/share/link";
export type { Round, RoundDiff } from "@/lib/share/round-types";
export type { SnapshotMeta } from "./updates";

/*
 * The only door to share and review data. Visitors have no database role (docs/SPEC.md section 4): every visitor request
 * runs in a server route, passes `requireVisitor`, and only then reaches a store (the service-role Supabase one, or the
 * in-memory one in unit tests and local-only mode). Later tasks append their methods to this interface and to BOTH
 * implementations (share-store-supabase.ts, share-store-memory.ts); the contract test runs against both.
 */

export interface Visitor {
  id: string;
  linkId: string;
  displayName: string | null;
  createdAt: string;
  lastSeenAt: string;
  lastRoundId: string | null;
}

/** What the share routes need to know about a board. `ownerId` stays on the server: it never goes into a visitor response. */
export interface StoreBoard {
  id: string;
  ownerId: string;
  title: string;
  /** Set while the board is in the trash. */
  deletedAt: string | null;
}

/** The part of an assets row a viewer can need. (A full row is assignable too; the builder reads these fields only.) */
export type ViewerAssetRow = Pick<AssetRow, "id" | "kind" | "width" | "height" | "variants" | "source_url" | "credit" | "licence">;

export type NewLink = Omit<LinkRow, "id" | "createdAt" | "revokedAt" | "cookieEpoch" | "votesRevealed">;

export type LinkUpdate = Partial<Omit<LinkRow, "id" | "boardId" | "ownerId" | "tokenHash" | "createdAt">> & { bumpEpoch?: boolean };

/** A round to store: the server picks id and time. `number` is the caller's choice and must be free on the board. */
export type NewRound = Omit<Round, "id" | "publishedAt">;

/** insertRound found the (board, number) pair already used: another publish got there first. */
export class RoundNumberTakenError extends Error {
  constructor(public readonly boardId: string, public readonly number: number) {
    super(`Round ${number} already exists on board ${boardId}`);
    this.name = "RoundNumberTakenError";
  }
}

export interface AttemptState {
  fails: number;
  lockedUntil: string | null;
}

export interface ShareStore {
  // --- links (Task 11) ---
  insertLink(row: NewLink): Promise<LinkRow>;
  getLinkByHash(tokenHash: string): Promise<LinkRow | null>;
  getLink(id: string): Promise<LinkRow | null>;
  /** The owner's links on one board, newest first. */
  listLinks(boardId: string, ownerId: string): Promise<LinkRow[]>;
  /** null when the link does not exist or is not this owner's. */
  updateLink(id: string, ownerId: string, patch: LinkUpdate): Promise<LinkRow | null>;
  /** Sets revokedAt (the first revocation time is kept) and bumps cookieEpoch, so every cookie dies at once. */
  revokeLink(id: string, ownerId: string, now: Date): Promise<LinkRow | null>;
  deleteLink(id: string, ownerId: string): Promise<boolean>;
  /** Newest first. */
  listRounds(boardId: string): Promise<Round[]>;
  getRound(id: string): Promise<Round | null>;
  latestRound(boardId: string): Promise<Round | null>;

  // --- rounds and versions (Tasks 9 and 10): written by the owner's routes only ---
  /**
   * Snapshots the board's CURRENT merged state on the server (the newest compaction snapshot plus every update row after it)
   * and stores it as `kind`. Nothing the browser sends goes into it. Never deletes update rows. Throws StateTooLargeError
   * over the size cap.
   */
  snapshotBoard(boardId: string, kind: "compaction" | "round", label: string | null): Promise<{ id: string; uptoSeq: number; state: Uint8Array }>;
  /** Removes one snapshot of that board (used to clean up after a publish that failed); a round's snapshot cannot be removed. */
  deleteSnapshot(id: string, boardId: string): Promise<void>;
  /** The board's snapshots, newest first. */
  listSnapshots(boardId: string): Promise<SnapshotMeta[]>;
  /** Throws RoundNumberTakenError when `number` is used on that board already. */
  insertRound(row: NewRound): Promise<Round>;

  // --- visitors and password attempts (Task 12) ---
  createVisitor(linkId: string, ipHash: string | null): Promise<Visitor>;
  getVisitor(id: string): Promise<Visitor | null>;
  setVisitorName(id: string, name: string): Promise<void>;
  touchVisitor(id: string, patch: { lastRoundId?: string | null }): Promise<void>;
  countVisitors(linkId: string): Promise<number>;
  countRecentVisitors(linkId: string, ipHash: string, since: Date): Promise<number>;
  getAttempt(linkId: string, ipHash: string): Promise<AttemptState | null>;
  /** fails + 1 (a row left alone for an hour starts again at 1); lockedUntil = now + lockSeconds(fails). */
  recordFailure(linkId: string, ipHash: string, now: Date): Promise<AttemptState>;
  clearAttempts(linkId: string, ipHash: string): Promise<void>;

  // --- what a viewer is built from (Task 13) ---
  getBoard(boardId: string): Promise<StoreBoard | null>;
  getBoardTitle(boardId: string): Promise<string | null>;
  /** The Yjs state of a round's snapshot; null unless that snapshot belongs to `boardId`. */
  getSnapshotState(snapshotId: string, boardId: string): Promise<Uint8Array | null>;
  /** The board's current merged Yjs state (newest snapshot plus every later update); null when the board has none. */
  getLiveState(boardId: string): Promise<Uint8Array | null>;
  /** Rows for the given asset ids (unknown ids are simply missing). */
  getAssets(ids: string[]): Promise<ViewerAssetRow[]>;
}

let override: ShareStore | null = null;
let shared: ShareStore | null = null;

/**
 * The store for this process: in-memory in local-only mode (development and end-to-end tests, no database), otherwise the
 * service-role Supabase store. Throws a 503 Response when Supabase is not configured.
 */
export function getShareStore(): ShareStore {
  if (override) return override;
  if (isLocalOnly()) {
    // On globalThis so a dev-server hot reload keeps the links made so far.
    const g = globalThis as { __atelierMemoryShare?: ShareStore };
    return (g.__atelierMemoryShare ??= new MemoryShareStore());
  }
  if (shared) return shared;
  const store = createSupabaseShareStore();
  if (!store) throw Response.json({ error: "not-configured" }, { status: 503, headers: { "cache-control": "no-store" } });
  shared = store;
  return store;
}

/** Tests only: use this store from now on (null puts the normal choice back). */
export function setShareStore(store: ShareStore | null): void {
  override = store;
  shared = null;
}
