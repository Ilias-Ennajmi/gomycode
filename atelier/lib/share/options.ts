import { z } from "zod";
import type { LinkMode, LinkPermission, LinkRow, LinkScope } from "./link";

export * from "./link";

/**
 * What the owner chooses when making or changing a share link (docs/SPEC.md section 5), and the one place that validates it.
 * Everything here runs on the server again no matter what the dialog already checked.
 */

// Same numbers as lib/share/password.ts (a test keeps them equal); not imported from there so the owner's dialog can use this
// file without pulling the hashing library (and node:crypto) into the browser bundle.
export const PASSWORD_MIN = 4;
export const PASSWORD_MAX = 128;
export const NAME_MAX = 80;
export const WELCOME_NOTE_MAX = 500;
export const MAX_FRAMES = 100;
export const MAX_EXPIRY_DAYS = 365;

export interface ShareLinkOptions {
  name: string;
  mode: LinkMode;
  roundId: string | null;
  scope: LinkScope;
  frameIds: string[];
  permission: LinkPermission;
  /** Plaintext, on its way to be hashed. null = no password. */
  password: string | null;
  /** ISO timestamp in the future, at most 365 days out. */
  expiresAt: string | null;
  /** Plain text. */
  welcomeNote: string;
  allowDownload: boolean;
  watermark: boolean;
  showCredits: boolean;
  blindVotes: boolean;
}

/** SPEC section 12 Q4: view + react by default, commenting is opt-in. Round mode with the latest round. */
export const DEFAULT_LINK_OPTIONS: ShareLinkOptions = {
  name: "Client link",
  mode: "round",
  roundId: null,
  scope: "board",
  frameIds: [],
  permission: "react",
  password: null,
  expiresAt: null,
  welcomeNote: "",
  allowDownload: false,
  watermark: false,
  showCredits: false,
  blindVotes: false,
};

export interface ValidationContext {
  now: Date;
  /** The board's rounds, NEWEST FIRST (the first one is what "latest" means). */
  roundIds: string[];
  /** Ids of the frames on the board. */
  frameIds: string[];
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

// Control characters (except newline and tab), bidi overrides and other invisible format characters out; NFC; trimmed.
function cleanNote(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}]/gu, (c) => (c === "\n" || c === "\t" ? c : ""))
    .replace(/\r/g, "")
    .trim();
}

const bool = z.boolean({ error: "Must be true or false" });

const SHAPE = {
  name: z
    .string({ error: "Enter a name" })
    .transform((s) => cleanNote(s).replace(/\s+/g, " "))
    .pipe(z.string().min(1, "Enter a name").max(NAME_MAX, `Use at most ${NAME_MAX} characters`)),
  mode: z.enum(["round", "live"], { error: "Choose a published round or the live board" }),
  roundId: z.string({ error: "Choose a round" }).min(1).max(64).nullable(),
  scope: z.enum(["board", "frames"], { error: "Choose the whole board or some frames" }),
  frameIds: z.array(z.string().min(1).max(100), { error: "Choose frames" }),
  permission: z.enum(["view", "react", "comment"], { error: "Choose view, react or comment" }),
  password: z
    .string({ error: "Enter a password" })
    .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
    .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters`)
    .nullable(),
  expiresAt: z.string({ error: "Enter a date" }).nullable(),
  welcomeNote: z
    .string({ error: "Enter text" })
    .transform(cleanNote)
    .pipe(z.string().max(WELCOME_NOTE_MAX, `Use at most ${WELCOME_NOTE_MAX} characters`)),
  allowDownload: bool,
  watermark: bool,
  showCredits: bool,
  blindVotes: bool,
};

const FULL = z.strictObject(SHAPE);
const PATCH = z.strictObject({ ...SHAPE, votesRevealed: bool }).partial();

function issuesToErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) errors[key] = "Not an option";
      continue;
    }
    const key = typeof issue.path[0] === "string" ? issue.path[0] : "_";
    errors[key] ??= issue.message;
  }
  return errors;
}

/** Rules that look at the date, the board's rounds and frames. Returns errors keyed by option name. */
function checkAgainstBoard(
  o: Partial<ShareLinkOptions>,
  ctx: ValidationContext,
  touched: (key: keyof ShareLinkOptions) => boolean,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (touched("expiresAt") && o.expiresAt != null) {
    const at = Date.parse(o.expiresAt);
    if (!Number.isFinite(at) || o.expiresAt.length > 40) errors.expiresAt = "Enter a valid date";
    else if (at <= ctx.now.getTime()) errors.expiresAt = "Choose a date in the future";
    else if (at > ctx.now.getTime() + MAX_EXPIRY_DAYS * 86_400_000) errors.expiresAt = `Choose a date within ${MAX_EXPIRY_DAYS} days`;
  }

  if (o.mode === "round") {
    if (ctx.roundIds.length === 0) errors.roundId = "Publish a round first";
    else if (o.roundId != null && !ctx.roundIds.includes(o.roundId)) errors.roundId = "That round is not on this board";
  }

  if (o.scope === "frames") {
    const ids = o.frameIds ?? [];
    if (ids.length < 1) errors.frameIds = "Choose at least one frame";
    else if (ids.length > MAX_FRAMES) errors.frameIds = `Choose at most ${MAX_FRAMES} frames`;
    else {
      const known = new Set(ctx.frameIds);
      if (ids.some((id) => !known.has(id))) errors.frameIds = "One of those frames is not on this board";
    }
  }
  return errors;
}

/** Makes the combination consistent: a live link has no round, a board link no frame list, a round link defaults to the latest. */
function normalise<T extends Partial<ShareLinkOptions>>(o: T, ctx: ValidationContext): T {
  const out = { ...o };
  if (out.mode === "live") out.roundId = null;
  else if (out.mode === "round" && out.roundId == null) out.roundId = ctx.roundIds[0] ?? null;
  if (out.scope === "board") out.frameIds = [];
  else if (out.frameIds) out.frameIds = [...new Set(out.frameIds)];
  return out;
}

/**
 * Full options for a NEW link. Absent keys take the defaults; unknown keys are an error (so a client can never smuggle in
 * `tokenHash`, `ownerId` or `revokedAt`).
 */
export function validateLinkOptions(raw: unknown, ctx: ValidationContext): ValidationResult<ShareLinkOptions> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, errors: { _: "Send an object of options" } };
  const parsed = FULL.safeParse({ ...DEFAULT_LINK_OPTIONS, ...(raw as Record<string, unknown>) });
  if (!parsed.success) return { ok: false, errors: issuesToErrors(parsed.error) };
  const value = normalise(parsed.data as ShareLinkOptions, ctx);
  const errors = checkAgainstBoard(value, ctx, () => true);
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

/** A patch to an existing link: only keys that are present are validated (and returned). `password`: string sets, null clears, absent keeps. */
export type LinkPatch = Partial<ShareLinkOptions> & { votesRevealed?: boolean };

export function validateLinkPatch(raw: unknown, ctx: ValidationContext, current: LinkRow): ValidationResult<LinkPatch> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, errors: { _: "Send an object of options" } };
  const parsed = PATCH.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: issuesToErrors(parsed.error) };
  const patch = parsed.data as LinkPatch;
  if (Object.keys(patch).length === 0) return { ok: false, errors: { _: "Nothing to change" } };

  // The rules about combinations apply to the link as it would be after the change.
  const merged: Partial<ShareLinkOptions> = normalise(
    {
      mode: patch.mode ?? current.mode,
      roundId: "roundId" in patch ? patch.roundId : patch.mode === "live" ? null : current.roundId,
      scope: patch.scope ?? current.scope,
      frameIds: patch.frameIds ?? current.frameIds,
      expiresAt: patch.expiresAt,
    },
    ctx,
  );
  const errors = checkAgainstBoard(merged, ctx, (k) => k in patch);
  if (Object.keys(errors).length) return { ok: false, errors };

  const value: LinkPatch = { ...patch };
  // Keep the derived fields the combination implies (round id, cleared frame list) in step with what was asked.
  if ("mode" in patch || "roundId" in patch) value.roundId = merged.roundId ?? null;
  if ("scope" in patch || "frameIds" in patch) value.frameIds = merged.frameIds ?? [];
  return { ok: true, value };
}
