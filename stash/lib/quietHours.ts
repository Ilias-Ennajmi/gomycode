/*
 * Quiet hours and "is it time yet" checks in the owner's time zone. Pure, so
 * the cron routes and the tests agree.
 */

export type QuietHours = { start: string; end: string };

export const DEFAULT_QUIET: QuietHours = { start: "22:00", end: "08:00" };
export const DEFAULT_TIMEZONE = "Africa/Casablanca";

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function toMinutes(hhmm: string): number | null {
  const m = HHMM.exec(hhmm.slice(0, 5));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function parseQuiet(v: unknown): QuietHours | null {
  if (!v || typeof v !== "object") return null;
  const { start, end } = v as Record<string, unknown>;
  if (typeof start !== "string" || typeof end !== "string") return null;
  if (toMinutes(start) === null || toMinutes(end) === null) return null;
  return { start: start.slice(0, 5), end: end.slice(0, 5) };
}

/** Minutes since local midnight in a time zone. Falls back to UTC for an unknown zone. */
export function localMinutes(now: Date, timeZone: string): number {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return (h % 24) * 60 + m;
}

/** True inside quiet hours. Handles windows over midnight (22:00–08:00). Equal start/end = no quiet hours. */
export function inQuietHours(now: Date, quiet: QuietHours | null, timeZone: string): boolean {
  if (!quiet) return false;
  const s = toMinutes(quiet.start);
  const e = toMinutes(quiet.end);
  if (s === null || e === null || s === e) return false;
  const t = localMinutes(now, timeZone);
  return s < e ? t >= s && t < e : t >= s || t < e;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
