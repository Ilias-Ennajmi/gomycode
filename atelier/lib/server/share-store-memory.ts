import { lockSeconds } from "@/lib/share/backoff";
import type { LinkRow } from "@/lib/share/link";
import type { Round } from "@/lib/share/round-types";
import * as Y from "yjs";
import type { AttemptState, LinkUpdate, NewLink, ShareStore, StoreBoard, Visitor, ViewerAssetRow } from "./share-store";

/**
 * The in-memory ShareStore: backs the unit tests and local-only mode (development and end-to-end tests, no database).
 * It follows the same rules as the Supabase one (the contract test runs both), so a test that passes here says something
 * about production. Everything is copied on the way in and out, so a caller can never mutate a stored row by accident.
 */

const ATTEMPT_FORGET_MS = 60 * 60 * 1000;

const copy = <T>(v: T): T => structuredClone(v);

export class MemoryShareStore implements ShareStore {
  private readonly now: () => Date;
  private links = new Map<string, LinkRow>();
  private visitors = new Map<string, Visitor & { ipHash: string | null }>();
  private attempts = new Map<string, { fails: number; lockedUntil: string | null; updatedAt: number }>();
  private rounds = new Map<string, Round>();
  private boards = new Map<string, StoreBoard>();
  private snapshots = new Map<string, { boardId: string; state: Uint8Array }>();
  private live = new Map<string, Uint8Array[]>();
  private assets = new Map<string, ViewerAssetRow>();

  constructor(opts: { now?: () => Date } = {}) {
    this.now = opts.now ?? (() => new Date());
  }

  // ---- seeding (tests and local-only mode) --------------------------------------------------------------

  seedBoard(b: { id: string; ownerId: string; title?: string; deletedAt?: string | null }): void {
    this.boards.set(b.id, { id: b.id, ownerId: b.ownerId, title: b.title ?? "Untitled", deletedAt: b.deletedAt ?? null });
  }
  seedSnapshot(boardId: string, snapshotId: string, state: Uint8Array): void {
    this.snapshots.set(snapshotId, { boardId, state: new Uint8Array(state) });
  }
  seedRound(r: Round): void {
    this.rounds.set(r.id, copy(r));
  }
  /** Adds one Yjs update to the board's live state (like a row of board_updates). */
  seedLiveState(boardId: string, update: Uint8Array): void {
    const list = this.live.get(boardId) ?? [];
    list.push(new Uint8Array(update));
    this.live.set(boardId, list);
  }
  /** Replaces the board's live state (local-only mode: the dialog hands over the whole current state each time). */
  replaceLiveState(boardId: string, update: Uint8Array): void {
    this.live.set(boardId, [new Uint8Array(update)]);
  }
  /** Makes sure the board exists (local-only mode has no boards table); the title is only set when it is new or given. */
  ensureBoard(b: { id: string; ownerId: string; title?: string }): void {
    const known = this.boards.get(b.id);
    if (!known) this.seedBoard(b);
    else if (b.title !== undefined) known.title = b.title;
  }
  seedAsset(a: { id: string; kind?: "image" | "video" | "gif" | "file"; width?: number | null; height?: number | null; variants?: unknown; source_url?: string | null; credit?: string | null; licence?: string | null }): void {
    this.assets.set(a.id, {
      id: a.id,
      kind: a.kind ?? "image",
      width: a.width === undefined ? 100 : a.width,
      height: a.height === undefined ? 50 : a.height,
      variants: (a.variants ?? { w1024: true }) as ViewerAssetRow["variants"],
      source_url: a.source_url ?? null,
      credit: a.credit ?? null,
      licence: a.licence ?? null,
    });
  }

  // ---- links ---------------------------------------------------------------------------------------------

  async insertLink(row: NewLink): Promise<LinkRow> {
    for (const l of this.links.values()) if (l.tokenHash === row.tokenHash) throw new Error("duplicate token hash");
    const link: LinkRow = { ...copy(row), id: crypto.randomUUID(), createdAt: this.now().toISOString(), revokedAt: null, cookieEpoch: 0, votesRevealed: false };
    this.links.set(link.id, link);
    return copy(link);
  }

  async getLinkByHash(tokenHash: string): Promise<LinkRow | null> {
    for (const l of this.links.values()) if (l.tokenHash === tokenHash) return copy(l);
    return null;
  }

  async getLink(id: string): Promise<LinkRow | null> {
    const l = this.links.get(id);
    return l ? copy(l) : null;
  }

  async listLinks(boardId: string, ownerId: string): Promise<LinkRow[]> {
    return [...this.links.values()]
      .filter((l) => l.boardId === boardId && l.ownerId === ownerId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
      .map(copy);
  }

  async updateLink(id: string, ownerId: string, patch: LinkUpdate): Promise<LinkRow | null> {
    const l = this.links.get(id);
    if (!l || l.ownerId !== ownerId) return null;
    const { bumpEpoch, ...fields } = patch;
    Object.assign(l, copy(fields));
    if (bumpEpoch) l.cookieEpoch += 1;
    return copy(l);
  }

  async revokeLink(id: string, ownerId: string, now: Date): Promise<LinkRow | null> {
    const l = this.links.get(id);
    if (!l || l.ownerId !== ownerId) return null;
    l.revokedAt ??= now.toISOString();
    l.cookieEpoch += 1;
    return copy(l);
  }

  async deleteLink(id: string, ownerId: string): Promise<boolean> {
    const l = this.links.get(id);
    if (!l || l.ownerId !== ownerId) return false;
    this.links.delete(id);
    for (const [vid, v] of this.visitors) if (v.linkId === id) this.visitors.delete(vid);
    for (const key of this.attempts.keys()) if (key.startsWith(`${id}\n`)) this.attempts.delete(key);
    return true;
  }

  async listRounds(boardId: string): Promise<Round[]> {
    return [...this.rounds.values()].filter((r) => r.boardId === boardId).sort((a, b) => b.number - a.number).map(copy);
  }
  async getRound(id: string): Promise<Round | null> {
    const r = this.rounds.get(id);
    return r ? copy(r) : null;
  }
  async latestRound(boardId: string): Promise<Round | null> {
    return (await this.listRounds(boardId))[0] ?? null;
  }

  // ---- visitors and attempts -----------------------------------------------------------------------------

  private publicVisitor(v: Visitor & { ipHash: string | null }): Visitor {
    const { ipHash: _ip, ...rest } = v;
    void _ip;
    return copy(rest);
  }

  async createVisitor(linkId: string, ipHash: string | null): Promise<Visitor> {
    const at = this.now().toISOString();
    const v = { id: crypto.randomUUID(), linkId, displayName: null, createdAt: at, lastSeenAt: at, lastRoundId: null, ipHash };
    this.visitors.set(v.id, v);
    return this.publicVisitor(v);
  }
  async getVisitor(id: string): Promise<Visitor | null> {
    const v = this.visitors.get(id);
    return v ? this.publicVisitor(v) : null;
  }
  async setVisitorName(id: string, name: string): Promise<void> {
    const v = this.visitors.get(id);
    if (v) v.displayName = name;
  }
  async touchVisitor(id: string, patch: { lastRoundId?: string | null }): Promise<void> {
    const v = this.visitors.get(id);
    if (!v) return;
    v.lastSeenAt = this.now().toISOString();
    if (patch.lastRoundId !== undefined) v.lastRoundId = patch.lastRoundId;
  }
  async countVisitors(linkId: string): Promise<number> {
    return [...this.visitors.values()].filter((v) => v.linkId === linkId).length;
  }
  async countRecentVisitors(linkId: string, ipHash: string, since: Date): Promise<number> {
    return [...this.visitors.values()].filter((v) => v.linkId === linkId && v.ipHash === ipHash && Date.parse(v.createdAt) >= since.getTime()).length;
  }

  async getAttempt(linkId: string, ipHash: string): Promise<AttemptState | null> {
    const a = this.attempts.get(`${linkId}\n${ipHash}`);
    return a ? { fails: a.fails, lockedUntil: a.lockedUntil } : null;
  }
  async recordFailure(linkId: string, ipHash: string, now: Date): Promise<AttemptState> {
    const key = `${linkId}\n${ipHash}`;
    const prev = this.attempts.get(key);
    const fails = (prev && now.getTime() - prev.updatedAt <= ATTEMPT_FORGET_MS ? prev.fails : 0) + 1;
    const lock = lockSeconds(fails);
    const next = { fails, lockedUntil: lock > 0 ? new Date(now.getTime() + lock * 1000).toISOString() : null, updatedAt: now.getTime() };
    this.attempts.set(key, next);
    return { fails: next.fails, lockedUntil: next.lockedUntil };
  }
  async clearAttempts(linkId: string, ipHash: string): Promise<void> {
    this.attempts.delete(`${linkId}\n${ipHash}`);
  }

  // ---- board data ----------------------------------------------------------------------------------------

  async getBoard(boardId: string): Promise<StoreBoard | null> {
    const b = this.boards.get(boardId);
    return b ? copy(b) : null;
  }
  async getBoardTitle(boardId: string): Promise<string | null> {
    return this.boards.get(boardId)?.title ?? null;
  }
  async getSnapshotState(snapshotId: string, boardId: string): Promise<Uint8Array | null> {
    const s = this.snapshots.get(snapshotId);
    return s && s.boardId === boardId ? new Uint8Array(s.state) : null;
  }
  async getLiveState(boardId: string): Promise<Uint8Array | null> {
    const updates = this.live.get(boardId);
    if (!updates || updates.length === 0) return null;
    const doc = new Y.Doc();
    for (const u of updates) Y.applyUpdate(doc, u);
    const state = Y.encodeStateAsUpdate(doc);
    doc.destroy();
    return state;
  }
  async getAssets(ids: string[]): Promise<ViewerAssetRow[]> {
    const out: ViewerAssetRow[] = [];
    for (const id of new Set(ids)) {
      const a = this.assets.get(id);
      if (a) out.push(copy(a));
    }
    return out;
  }
}
