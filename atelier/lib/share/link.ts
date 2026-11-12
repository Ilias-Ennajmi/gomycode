// A share link as the server holds it, and the pure rules about it (state, permission, scope). No I/O, no secrets:
// safe to import anywhere (the viewer uses `can` and `inScope` too).

export type LinkMode = "round" | "live";
export type LinkScope = "board" | "frames";
export type LinkPermission = "view" | "react" | "comment";

export interface LinkRow {
  id: string;
  boardId: string;
  ownerId: string;
  name: string;
  tokenHash: string;
  mode: LinkMode;
  roundId: string | null;
  scope: LinkScope;
  frameIds: string[];
  permission: LinkPermission;
  passwordHash: string | null;
  expiresAt: string | null;
  welcomeNote: string;
  allowDownload: boolean;
  watermark: boolean;
  showCredits: boolean;
  blindVotes: boolean;
  votesRevealed: boolean;
  cookieEpoch: number;
  createdAt: string;
  revokedAt: string | null;
}

export type Action = "view" | "react" | "comment" | "approve";
export type LinkStatus = "ok" | "revoked" | "expired";

/** What the owner's UI may see of a link: never the token hash or the password hash. */
export type ShareLinkSummary = Omit<LinkRow, "tokenHash" | "passwordHash"> & { hasPassword: boolean; status: LinkStatus };

/** Revoked wins over expired. An expiry that is not a date counts as expired (fail closed). */
export function linkState(l: Pick<LinkRow, "revokedAt" | "expiresAt">, now: Date): LinkStatus {
  if (l.revokedAt) return "revoked";
  if (l.expiresAt !== null) {
    const at = Date.parse(l.expiresAt);
    if (!Number.isFinite(at) || at <= now.getTime()) return "expired";
  }
  return "ok";
}

const ALLOWED: Record<LinkPermission, readonly Action[]> = {
  view: ["view"],
  react: ["view", "react", "approve"],
  comment: ["view", "react", "approve", "comment"],
};

/** view: look; react: look, pick/reject/more, approve; comment: everything. Unknown permission or action: no. */
export function can(l: Pick<LinkRow, "permission">, a: Action): boolean {
  const list = (ALLOWED as Record<string, readonly Action[] | undefined>)[l.permission];
  return list !== undefined && list.includes(a);
}

/** Board scope reaches everything; frames scope only the listed frames (an object outside every frame has `frameId: null`). */
export function inScope(l: Pick<LinkRow, "scope" | "frameIds">, ref: { frameId: string | null }): boolean {
  if (l.scope === "board") return true;
  return ref.frameId !== null && l.frameIds.includes(ref.frameId);
}

export function toSummary(l: LinkRow, now: Date): ShareLinkSummary {
  // Built field by field so a column added to LinkRow later is not exposed by accident.
  return {
    id: l.id,
    boardId: l.boardId,
    ownerId: l.ownerId,
    name: l.name,
    mode: l.mode,
    roundId: l.roundId,
    scope: l.scope,
    frameIds: [...l.frameIds],
    permission: l.permission,
    expiresAt: l.expiresAt,
    welcomeNote: l.welcomeNote,
    allowDownload: l.allowDownload,
    watermark: l.watermark,
    showCredits: l.showCredits,
    blindVotes: l.blindVotes,
    votesRevealed: l.votesRevealed,
    cookieEpoch: l.cookieEpoch,
    createdAt: l.createdAt,
    revokedAt: l.revokedAt,
    hasPassword: l.passwordHash !== null,
    status: linkState(l, now),
  };
}
