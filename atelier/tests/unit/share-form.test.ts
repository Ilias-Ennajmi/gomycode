import { describe, expect, it } from "vitest";
import {
  EXPIRY_CHOICES,
  describeLink,
  emptyForm,
  expiryFromChoice,
  formToOptions,
  validateForm,
  type FormState,
  type RoundOption,
} from "@/lib/share/share-form";
import type { ShareLinkSummary } from "@/lib/share/link";

const NOW = new Date("2026-11-12T10:00:00.000Z");
const ROUNDS: RoundOption[] = [
  { id: "r2", number: 2, label: "Colour pass", publishedAt: "2026-11-10T09:00:00.000Z" },
  { id: "r1", number: 1, label: "", publishedAt: "2026-11-01T09:00:00.000Z" },
];
const ctx = { now: NOW, rounds: ROUNDS, frameIds: ["f1", "f2", "f3"] };

const form = (patch: Partial<FormState> = {}): FormState => ({ ...emptyForm(ROUNDS), ...patch });

describe("form defaults", () => {
  it("starts on the latest published round with view and react, and falls back to live when there is none", () => {
    expect(emptyForm(ROUNDS)).toMatchObject({ mode: "round", roundId: "r2", permission: "react", scope: "board", name: "Client link" });
    expect(emptyForm([])).toMatchObject({ mode: "live", roundId: null });
  });
});

describe("expiry", () => {
  it("offers none, 1, 7 and 30 days, and a custom date", () => {
    expect(EXPIRY_CHOICES.map((c) => c.id)).toEqual(["none", "1d", "7d", "30d", "custom"]);
  });
  it("turns a preset into an instant that many days ahead", () => {
    expect(expiryFromChoice("none", "", NOW)).toBeNull();
    expect(expiryFromChoice("1d", "", NOW)).toBe("2026-11-13T10:00:00.000Z");
    expect(expiryFromChoice("7d", "", NOW)).toBe("2026-11-19T10:00:00.000Z");
    expect(expiryFromChoice("30d", "", NOW)).toBe("2026-12-12T10:00:00.000Z");
  });
  it("a custom date means the end of that day, local time; garbage is null so validation can say so", () => {
    expect(expiryFromChoice("custom", "2026-12-24", NOW)).toBe(new Date(2026, 11, 24, 23, 59, 0).toISOString());
    expect(expiryFromChoice("custom", "", NOW)).toBeNull();
    expect(expiryFromChoice("custom", "not a date", NOW)).toBeNull();
    expect(expiryFromChoice("custom", "2026-02-31", NOW)).toBeNull();
  });
});

describe("formToOptions", () => {
  it("maps every control to the option the API takes and drops what does not apply", () => {
    const o = formToOptions(
      form({ name: "  Acme  ", mode: "live", scope: "frames", frameIds: ["f2"], permission: "comment", passwordOn: true, password: "hunter22", expiry: "7d", welcomeNote: "Hi", allowDownload: true, watermark: true, showCredits: true, blindVotes: true }),
      NOW,
    );
    expect(o).toEqual({
      name: "Acme", mode: "live", roundId: null, scope: "frames", frameIds: ["f2"], permission: "comment", password: "hunter22",
      expiresAt: "2026-11-19T10:00:00.000Z", welcomeNote: "Hi", allowDownload: true, watermark: true, showCredits: true, blindVotes: true,
    });
  });
  it("a typed password is ignored while the password switch is off; a board link has no frame list; a live link no round", () => {
    const o = formToOptions(form({ passwordOn: false, password: "secret", scope: "board", frameIds: ["f1"], mode: "live", roundId: "r1" }), NOW);
    expect(o.password).toBeNull();
    expect(o.frameIds).toEqual([]);
    expect(o.roundId).toBeNull();
  });
});

describe("validateForm", () => {
  it("accepts the defaults", () => {
    expect(validateForm(form(), ctx).ok).toBe(true);
  });
  it("needs a name", () => {
    const r = validateForm(form({ name: "   " }), ctx);
    expect(r).toMatchObject({ ok: false, errors: { name: "Enter a name" } });
  });
  it("rejects a password under 4 characters and over 128, only when the switch is on", () => {
    expect(validateForm(form({ passwordOn: true, password: "abc" }), ctx)).toMatchObject({ ok: false, errors: { password: "Use at least 4 characters" } });
    expect(validateForm(form({ passwordOn: true, password: "x".repeat(129) }), ctx)).toMatchObject({ ok: false, errors: { password: "Use at most 128 characters" } });
    expect(validateForm(form({ passwordOn: false, password: "abc" }), ctx).ok).toBe(true);
  });
  it("a note over 500 characters is an error", () => {
    expect(validateForm(form({ welcomeNote: "x".repeat(501) }), ctx)).toMatchObject({ ok: false, errors: { welcomeNote: "Use at most 500 characters" } });
    expect(validateForm(form({ welcomeNote: "x".repeat(500) }), ctx).ok).toBe(true);
  });
  it("frames scope needs at least one frame, and frames that exist", () => {
    expect(validateForm(form({ scope: "frames", frameIds: [] }), ctx)).toMatchObject({ ok: false, errors: { frameIds: "Choose at least one frame" } });
    expect(validateForm(form({ scope: "frames", frameIds: ["nope"] }), ctx)).toMatchObject({ ok: false, errors: { frameIds: expect.stringContaining("not on this board") } });
    expect(validateForm(form({ scope: "frames", frameIds: ["f1", "f3"] }), ctx).ok).toBe(true);
  });
  it("round mode with no rounds says to publish one first", () => {
    const r = validateForm(form({ mode: "round", roundId: null }), { ...ctx, rounds: [] });
    expect(r).toMatchObject({ ok: false, errors: { roundId: "Publish a round first" } });
  });
  it("a custom expiry needs a date in the future and within a year", () => {
    expect(validateForm(form({ expiry: "custom", customDate: "" }), ctx)).toMatchObject({ ok: false, errors: { expiresAt: "Choose a date" } });
    expect(validateForm(form({ expiry: "custom", customDate: "2026-11-01" }), ctx)).toMatchObject({ ok: false, errors: { expiresAt: "Choose a date in the future" } });
    expect(validateForm(form({ expiry: "custom", customDate: "2028-01-01" }), ctx)).toMatchObject({ ok: false, errors: { expiresAt: expect.stringContaining("within 365 days") } });
    expect(validateForm(form({ expiry: "custom", customDate: "2026-12-24" }), ctx).ok).toBe(true);
  });
  it("reports every problem at once, keyed by field", () => {
    const r = validateForm(form({ name: "", passwordOn: true, password: "a", welcomeNote: "x".repeat(600) }), ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["name", "password", "welcomeNote"]);
  });
});

const link = (patch: Partial<ShareLinkSummary> = {}): ShareLinkSummary => ({
  id: "l1", boardId: "b", ownerId: "o", name: "Acme", mode: "round", roundId: "r2", scope: "board", frameIds: [], permission: "react", expiresAt: null,
  welcomeNote: "", allowDownload: false, watermark: false, showCredits: false, blindVotes: false, votesRevealed: false, cookieEpoch: 0,
  createdAt: "2026-11-11T08:00:00.000Z", revokedAt: null, hasPassword: false, status: "ok", ...patch,
});

describe("describeLink", () => {
  it("names the mode (the round's number and label, or Live), the permission, the scope and the state in words", () => {
    const d = describeLink(link(), ROUNDS, NOW);
    expect(d).toMatchObject({ mode: "Round 2 · Colour pass", permission: "View and react", scope: "Whole board", state: "Active", expiry: "Never expires" });
    expect(describeLink(link({ mode: "live", roundId: null }), ROUNDS, NOW).mode).toBe("Live board");
    expect(describeLink(link({ roundId: "gone" }), ROUNDS, NOW).mode).toBe("Round");
    expect(describeLink(link({ roundId: "r1" }), ROUNDS, NOW).mode).toBe("Round 1");
    expect(describeLink(link({ permission: "view" }), ROUNDS, NOW).permission).toBe("View only");
    expect(describeLink(link({ permission: "comment" }), ROUNDS, NOW).permission).toBe("View, react and comment");
    expect(describeLink(link({ scope: "frames", frameIds: ["a", "b"] }), ROUNDS, NOW).scope).toBe("2 frames");
    expect(describeLink(link({ scope: "frames", frameIds: ["a"] }), ROUNDS, NOW).scope).toBe("1 frame");
  });
  it("says revoked and expired plainly, with when", () => {
    expect(describeLink(link({ status: "revoked", revokedAt: "2026-11-12T09:00:00.000Z" }), ROUNDS, NOW)).toMatchObject({ state: "Revoked", canRevoke: false });
    const exp = describeLink(link({ status: "expired", expiresAt: "2026-11-09T10:00:00.000Z" }), ROUNDS, NOW);
    expect(exp).toMatchObject({ state: "Expired", canRevoke: true });
    expect(exp.expiry).toBe("Expired 3 days ago");
    expect(describeLink(link({ expiresAt: "2026-11-12T20:00:00.000Z" }), ROUNDS, NOW).expiry).toBe("Expires in 10 hours");
    expect(describeLink(link({ expiresAt: "2026-11-19T10:00:00.000Z" }), ROUNDS, NOW).expiry).toBe("Expires in 7 days");
  });
  it("lists the extras that are on", () => {
    expect(describeLink(link({ hasPassword: true, allowDownload: true, watermark: true, showCredits: true, blindVotes: true }), ROUNDS, NOW).extras).toEqual(["Password", "Downloads", "Watermark", "Credits", "Blind votes"]);
    expect(describeLink(link(), ROUNDS, NOW).extras).toEqual([]);
  });
  it("a revoked link cannot be revoked again", () => {
    expect(describeLink(link({ status: "revoked" }), ROUNDS, NOW).canRevoke).toBe(false);
    expect(describeLink(link(), ROUNDS, NOW).canRevoke).toBe(true);
  });
});
