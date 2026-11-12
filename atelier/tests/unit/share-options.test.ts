import { describe, expect, it } from "vitest";
import {
  DEFAULT_LINK_OPTIONS,
  can,
  inScope,
  linkState,
  validateLinkOptions,
  validateLinkPatch,
  type LinkRow,
} from "@/lib/share/options";

const NOW = new Date("2026-11-12T10:00:00Z");
const DAY = 86_400_000;
const ctx = { now: NOW, roundIds: ["r2", "r1"], frameIds: ["f1", "f2", "f3"] };
const iso = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

describe("validateLinkOptions", () => {
  it("accepts the defaults when a round exists and picks the latest round", () => {
    const r = validateLinkOptions(DEFAULT_LINK_OPTIONS, ctx);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.roundId).toBe("r2");
      expect(r.value.permission).toBe("react");
      expect(r.value.name).toBe("Client link");
    }
  });

  it("fills absent keys from the defaults", () => {
    const r = validateLinkOptions({ name: "Acme" }, ctx);
    expect(r).toMatchObject({ ok: true, value: { name: "Acme", scope: "board", allowDownload: false } });
  });

  it("mode round with no rounds says to publish one", () => {
    const r = validateLinkOptions(DEFAULT_LINK_OPTIONS, { ...ctx, roundIds: [] });
    expect(r).toEqual({ ok: false, errors: expect.objectContaining({ roundId: "Publish a round first" }) });
  });

  it("live mode needs no round and drops a stray roundId", () => {
    const r = validateLinkOptions({ mode: "live", roundId: "r1" }, { ...ctx, roundIds: [] });
    expect(r).toMatchObject({ ok: true, value: { mode: "live", roundId: null } });
  });

  it("rejects a round that is not this board's", () => {
    const r = validateLinkOptions({ roundId: "someone-elses" }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.roundId).toBeTruthy();
  });

  it("scope frames needs 1..100 existing frames", () => {
    for (const frameIds of [[], Array.from({ length: 101 }, (_, i) => `f${i}`), ["nope"]]) {
      const r = validateLinkOptions({ scope: "frames", frameIds }, { ...ctx, frameIds: Array.from({ length: 200 }, (_, i) => `f${i}`).filter((f) => f !== "nope") });
      expect(r.ok, JSON.stringify(frameIds).slice(0, 30)).toBe(false);
      if (!r.ok) expect(r.errors.frameIds).toBeTruthy();
    }
    expect(validateLinkOptions({ scope: "frames", frameIds: ["f1", "f2"] }, ctx)).toMatchObject({ ok: true, value: { frameIds: ["f1", "f2"] } });
  });

  it("scope board ignores frameIds", () => {
    expect(validateLinkOptions({ scope: "board", frameIds: ["f1"] }, ctx)).toMatchObject({ ok: true, value: { frameIds: [] } });
  });

  it("duplicate frame ids collapse", () => {
    expect(validateLinkOptions({ scope: "frames", frameIds: ["f1", "f1"] }, ctx)).toMatchObject({ ok: true, value: { frameIds: ["f1"] } });
  });

  it("expiry must be in the future and within a year", () => {
    expect(validateLinkOptions({ expiresAt: iso(-1000) }, ctx).ok).toBe(false);
    expect(validateLinkOptions({ expiresAt: iso(366 * DAY) }, ctx).ok).toBe(false);
    expect(validateLinkOptions({ expiresAt: "tomorrow" }, ctx).ok).toBe(false);
    expect(validateLinkOptions({ expiresAt: iso(7 * DAY) }, ctx).ok).toBe(true);
    expect(validateLinkOptions({ expiresAt: iso(365 * DAY) }, ctx).ok).toBe(true);
  });

  it("password is 4..128 characters or null", () => {
    expect(validateLinkOptions({ password: "abc" }, ctx).ok).toBe(false);
    expect(validateLinkOptions({ password: "x".repeat(129) }, ctx).ok).toBe(false);
    expect(validateLinkOptions({ password: "abcd" }, ctx).ok).toBe(true);
    expect(validateLinkOptions({ password: "x".repeat(128) }, ctx).ok).toBe(true);
    expect(validateLinkOptions({ password: null }, ctx).ok).toBe(true);
    expect(validateLinkOptions({ password: 1234 }, ctx).ok).toBe(false);
  });

  it("permission is view, react or comment", () => {
    expect(validateLinkOptions({ permission: "admin" }, ctx).ok).toBe(false);
    for (const p of ["view", "react", "comment"]) expect(validateLinkOptions({ permission: p }, ctx).ok).toBe(true);
  });

  it("welcome note is plain text of at most 500 characters", () => {
    expect(validateLinkOptions({ welcomeNote: "x".repeat(501) }, ctx).ok).toBe(false);
    expect(validateLinkOptions({ welcomeNote: "x".repeat(1001) }, ctx).ok).toBe(false);
    const r = validateLinkOptions({ welcomeNote: "Hi ‮there\u0000 <b>you</b>" }, ctx);
    // Control and bidi-override characters go; markup stays as inert text (escaping is the renderer's job).
    expect(r).toMatchObject({ ok: true, value: { welcomeNote: "Hi there <b>you</b>" } });
  });

  it("name is 1..80 characters", () => {
    expect(validateLinkOptions({ name: "" }, ctx).ok).toBe(false);
    expect(validateLinkOptions({ name: "x".repeat(81) }, ctx).ok).toBe(false);
    expect(validateLinkOptions({ name: "  Acme  " }, ctx)).toMatchObject({ ok: true, value: { name: "Acme" } });
  });

  it("booleans must be booleans", () => {
    expect(validateLinkOptions({ watermark: "yes" }, ctx).ok).toBe(false);
    expect(validateLinkOptions({ blindVotes: 1 }, ctx).ok).toBe(false);
  });

  it("rejects unknown keys and non-objects", () => {
    const r = validateLinkOptions({ isAdmin: true }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors)).toContain("isAdmin");
    expect(validateLinkOptions(null, ctx).ok).toBe(false);
    expect(validateLinkOptions([], ctx).ok).toBe(false);
    expect(validateLinkOptions("x", ctx).ok).toBe(false);
  });

  it("never accepts a tokenHash, ownerId or revokedAt from the client", () => {
    for (const k of ["tokenHash", "ownerId", "revokedAt", "cookieEpoch", "id", "boardId"]) {
      expect(validateLinkOptions({ [k]: "x" }, ctx).ok, k).toBe(false);
    }
  });
});

const row = (over: Partial<LinkRow> = {}): LinkRow => ({
  id: "l1", boardId: "b1", ownerId: "o1", name: "n", tokenHash: "h", mode: "live", roundId: null, scope: "board", frameIds: [],
  permission: "react", passwordHash: null, expiresAt: null, welcomeNote: "", allowDownload: false, watermark: false,
  showCredits: false, blindVotes: false, votesRevealed: false, cookieEpoch: 0, createdAt: iso(-DAY), revokedAt: null, ...over,
});

describe("validateLinkPatch", () => {
  it("only validates what changes: an expired link can still be renamed", () => {
    const cur = row({ expiresAt: iso(-DAY) });
    const r = validateLinkPatch({ name: "New name" }, ctx, cur);
    expect(r).toMatchObject({ ok: true, value: { name: "New name" } });
    if (r.ok) expect("expiresAt" in r.value).toBe(false);
  });

  it("distinguishes password set, cleared and untouched", () => {
    expect(validateLinkPatch({ password: "secret1" }, ctx, row())).toMatchObject({ ok: true, value: { password: "secret1" } });
    expect(validateLinkPatch({ password: null }, ctx, row())).toMatchObject({ ok: true, value: { password: null } });
    const keep = validateLinkPatch({ name: "x" }, ctx, row());
    expect(keep.ok && "password" in keep.value).toBe(false);
  });

  it("re-checks cross-field rules against the merged link", () => {
    // switching to frames scope without frames
    expect(validateLinkPatch({ scope: "frames" }, ctx, row()).ok).toBe(false);
    // switching to round mode on a link that has no round
    expect(validateLinkPatch({ mode: "round" }, { ...ctx, roundIds: [] }, row()).ok).toBe(false);
    expect(validateLinkPatch({ mode: "round" }, ctx, row())).toMatchObject({ ok: true, value: { mode: "round", roundId: "r2" } });
  });

  it("accepts votesRevealed and rejects unknown keys and an empty patch", () => {
    expect(validateLinkPatch({ votesRevealed: true }, ctx, row())).toMatchObject({ ok: true, value: { votesRevealed: true } });
    expect(validateLinkPatch({ tokenHash: "x" }, ctx, row()).ok).toBe(false);
    expect(validateLinkPatch({}, ctx, row()).ok).toBe(false);
  });
});

describe("linkState", () => {
  it("is ok, revoked or expired, and revoked wins over expired", () => {
    expect(linkState({ revokedAt: null, expiresAt: null }, NOW)).toBe("ok");
    expect(linkState({ revokedAt: null, expiresAt: iso(DAY) }, NOW)).toBe("ok");
    expect(linkState({ revokedAt: null, expiresAt: iso(-1) }, NOW)).toBe("expired");
    expect(linkState({ revokedAt: iso(-5), expiresAt: null }, NOW)).toBe("revoked");
    expect(linkState({ revokedAt: iso(-5), expiresAt: iso(-1) }, NOW)).toBe("revoked");
    // an expiry that is exactly now has passed
    expect(linkState({ revokedAt: null, expiresAt: NOW.toISOString() }, NOW)).toBe("expired");
  });
  it("treats an unparseable expiry as expired (fail closed)", () => {
    expect(linkState({ revokedAt: null, expiresAt: "garbage" }, NOW)).toBe("expired");
  });
});

describe("can", () => {
  const table: [LinkRow["permission"], Record<"view" | "react" | "comment" | "approve", boolean>][] = [
    ["view", { view: true, react: false, comment: false, approve: false }],
    ["react", { view: true, react: true, comment: false, approve: true }],
    ["comment", { view: true, react: true, comment: true, approve: true }],
  ];
  it.each(table)("%s", (permission, expected) => {
    for (const [action, ok] of Object.entries(expected)) expect(can({ permission }, action as "view"), action).toBe(ok);
  });
  it("denies an unknown action", () => {
    expect(can({ permission: "comment" }, "delete" as "view")).toBe(false);
  });
});

describe("inScope", () => {
  it("board scope allows everything, including no frame", () => {
    expect(inScope({ scope: "board", frameIds: [] }, { frameId: null })).toBe(true);
    expect(inScope({ scope: "board", frameIds: [] }, { frameId: "x" })).toBe(true);
  });
  it("frames scope allows only listed frames and rejects null", () => {
    const l = { scope: "frames" as const, frameIds: ["f1", "f2"] };
    expect(inScope(l, { frameId: "f1" })).toBe(true);
    expect(inScope(l, { frameId: "f3" })).toBe(false);
    expect(inScope(l, { frameId: null })).toBe(false);
  });
});

describe("password limits", () => {
  it("match the hashing module without importing it", async () => {
    const hashing = await import("@/lib/share/password");
    const options = await import("@/lib/share/options");
    expect(options.PASSWORD_MIN).toBe(hashing.PASSWORD_MIN);
    expect(options.PASSWORD_MAX).toBe(hashing.PASSWORD_MAX);
  });
});
