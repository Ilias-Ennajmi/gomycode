// The Share dialog's form as plain data: its state, how it becomes the options the API takes, how it is validated (the same
// `validateLinkOptions` the server runs again), and how an existing link is described in words. No React, no network.
import { DEFAULT_LINK_OPTIONS, validateLinkOptions, WELCOME_NOTE_MAX, type ShareLinkOptions } from "./options";
import type { LinkPermission, ShareLinkSummary } from "./link";

/** What the dialog needs to know about a published round (the rounds API's answer, reduced). */
export interface RoundOption {
  id: string;
  number: number;
  label: string;
  publishedAt: string;
}

export type ExpiryChoice = "none" | "1d" | "7d" | "30d" | "custom";
export const EXPIRY_CHOICES: { id: ExpiryChoice; label: string; days?: number }[] = [
  { id: "none", label: "No expiry" },
  { id: "1d", label: "1 day", days: 1 },
  { id: "7d", label: "7 days", days: 7 },
  { id: "30d", label: "30 days", days: 30 },
  { id: "custom", label: "Pick a date" },
];

export interface FormState {
  name: string;
  mode: "round" | "live";
  roundId: string | null;
  scope: "board" | "frames";
  frameIds: string[];
  permission: LinkPermission;
  passwordOn: boolean;
  password: string;
  expiry: ExpiryChoice;
  /** yyyy-mm-dd, for expiry "custom". */
  customDate: string;
  welcomeNote: string;
  allowDownload: boolean;
  watermark: boolean;
  showCredits: boolean;
  blindVotes: boolean;
}

/** Rounds are newest first. With none to publish from, the link starts as a live one. */
export function emptyForm(rounds: readonly RoundOption[]): FormState {
  const d = DEFAULT_LINK_OPTIONS;
  return {
    name: d.name,
    mode: rounds.length > 0 ? "round" : "live",
    roundId: rounds[0]?.id ?? null,
    scope: d.scope,
    frameIds: [],
    permission: d.permission,
    passwordOn: false,
    password: "",
    expiry: "none",
    customDate: "",
    welcomeNote: d.welcomeNote,
    allowDownload: d.allowDownload,
    watermark: d.watermark,
    showCredits: d.showCredits,
    blindVotes: d.blindVotes,
  };
}

const DAY_MS = 86_400_000;

/** The instant a choice stands for. A custom date is the end of that day in the owner's time zone; anything unusable is null. */
export function expiryFromChoice(choice: ExpiryChoice, customDate: string, now: Date): string | null {
  if (choice === "none") return null;
  if (choice === "custom") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(customDate.trim());
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const at = new Date(y, mo - 1, d, 23, 59, 0);
    if (at.getFullYear() !== y || at.getMonth() !== mo - 1 || at.getDate() !== d) return null;
    return at.toISOString();
  }
  const days = EXPIRY_CHOICES.find((c) => c.id === choice)?.days ?? 0;
  return new Date(now.getTime() + days * DAY_MS).toISOString();
}

export function formToOptions(f: FormState, now: Date): ShareLinkOptions {
  return {
    name: f.name.trim(),
    mode: f.mode,
    roundId: f.mode === "round" ? f.roundId : null,
    scope: f.scope,
    frameIds: f.scope === "frames" ? [...f.frameIds] : [],
    permission: f.permission,
    password: f.passwordOn ? f.password : null,
    expiresAt: expiryFromChoice(f.expiry, f.customDate, now),
    welcomeNote: f.welcomeNote,
    allowDownload: f.allowDownload,
    watermark: f.watermark,
    showCredits: f.showCredits,
    blindVotes: f.blindVotes,
  };
}

export type FormResult = { ok: true; value: ShareLinkOptions } | { ok: false; errors: Record<string, string> };

/** Every problem at once, keyed by the option's name. */
export function validateForm(f: FormState, ctx: { now: Date; rounds: readonly RoundOption[]; frameIds: readonly string[] }): FormResult {
  const options = formToOptions(f, ctx.now);
  const extra: Record<string, string> = {};
  if (f.expiry === "custom" && options.expiresAt === null) extra.expiresAt = "Choose a date";
  const checked = validateLinkOptions(options, { now: ctx.now, roundIds: ctx.rounds.map((r) => r.id), frameIds: [...ctx.frameIds] });
  const errors = { ...(checked.ok ? {} : checked.errors), ...extra };
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return checked.ok ? { ok: true, value: checked.value } : { ok: false, errors };
}

export { WELCOME_NOTE_MAX };

// ---- existing links, in words ----------------------------------------------------------------------------------------

export const PERMISSION_LABEL: Record<LinkPermission, string> = {
  view: "View only",
  react: "View and react",
  comment: "View, react and comment",
};

export interface LinkDescription {
  name: string;
  mode: string;
  permission: string;
  scope: string;
  expiry: string;
  state: "Active" | "Expired" | "Revoked";
  extras: string[];
  /** Revoking stops a link that still works; a revoked one is done. */
  canRevoke: boolean;
}

function relative(ms: number, past: boolean): string {
  const abs = Math.abs(ms);
  const minutes = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / DAY_MS);
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const span = abs < 3_600_000 ? plural(Math.max(1, minutes), "minute") : abs < DAY_MS ? plural(hours, "hour") : plural(days, "day");
  return past ? `${span} ago` : `in ${span}`;
}

export function describeLink(l: ShareLinkSummary, rounds: readonly RoundOption[], now: Date): LinkDescription {
  let mode = "Live board";
  if (l.mode === "round") {
    const r = rounds.find((x) => x.id === l.roundId);
    mode = r ? (r.label.trim() ? `Round ${r.number} · ${r.label.trim()}` : `Round ${r.number}`) : "Round";
  }
  let expiry = "Never expires";
  if (l.expiresAt) {
    const at = Date.parse(l.expiresAt);
    if (Number.isFinite(at)) expiry = at <= now.getTime() ? `Expired ${relative(now.getTime() - at, true)}` : `Expires ${relative(at - now.getTime(), false)}`;
    else expiry = "Expired";
  }
  const extras = [l.hasPassword && "Password", l.allowDownload && "Downloads", l.watermark && "Watermark", l.showCredits && "Credits", l.blindVotes && "Blind votes"].filter((x): x is string => !!x);
  return {
    name: l.name,
    mode,
    permission: PERMISSION_LABEL[l.permission] ?? l.permission,
    scope: l.scope === "board" ? "Whole board" : `${l.frameIds.length} frame${l.frameIds.length === 1 ? "" : "s"}`,
    expiry,
    state: l.status === "revoked" ? "Revoked" : l.status === "expired" ? "Expired" : "Active",
    extras,
    canRevoke: l.status !== "revoked",
  };
}
