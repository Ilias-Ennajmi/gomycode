import { SPACE_COLORS, type SpaceColor } from "@/components/ui/space";

/** Saved Wrapped: one month in numbers (stash.wrapped RPC). */
export type Wrapped = {
  month: string; // YYYY-MM-01
  saved: number;
  watched: number;
  applied: number;
  kept: number;
  recalled: number;
  topSpaces: { id: string; name: string; color: SpaceColor; count: number }[];
  topCreators: { handle: string; count: number }[];
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Validates the RPC's JSON; anything missing reads as zero / empty. */
export function parseWrapped(raw: unknown, month: string): Wrapped {
  const r = rec(raw);
  return {
    month: typeof r.month === "string" ? r.month : month,
    saved: num(r.saved),
    watched: num(r.watched),
    applied: num(r.applied),
    kept: num(r.kept),
    recalled: num(r.recalled),
    topSpaces: list(r.top_spaces).flatMap((x) => {
      const s = rec(x);
      if (typeof s.id !== "string" || typeof s.name !== "string") return [];
      const color = (SPACE_COLORS as readonly string[]).includes(String(s.color)) ? (s.color as SpaceColor) : "inbox";
      return [{ id: s.id, name: s.name, color, count: num(s.count) }];
    }),
    topCreators: list(r.top_creators).flatMap((x) => {
      const c = rec(x);
      return typeof c.handle === "string" && c.handle ? [{ handle: c.handle, count: num(c.count) }] : [];
    }),
  };
}

/** First day of the month of `d`, as YYYY-MM-01 (local calendar). */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function shiftMonth(key: string, by: number): string {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + by, 1));
}

export function monthLabel(key: string, withYear = true): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 15).toLocaleDateString("en-GB", withYear ? { month: "long", year: "numeric" } : { month: "long" });
}

/** Bar length in percent of the largest value (0 stays 0; a non-zero value is at least visible). */
export function barPercent(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.max(4, Math.round((value / max) * 100));
}

/** The text that goes with "Share my month". */
export function wrappedShareText(w: Wrapped, current: boolean): string {
  const when = current ? `My ${monthLabel(w.month, false)} so far` : `My ${monthLabel(w.month)}`;
  const lines = [`${when} in Stash: ${w.saved} saved · ${w.watched} watched · ${w.applied} applied.`];
  if (w.topSpaces[0]) lines.push(`Top Space: ${w.topSpaces[0].name}.`);
  if (w.topCreators[0]) lines.push(`Most saved creator: ${w.topCreators[0].handle}.`);
  return lines.join(" ");
}
