// Dates in the rounds UI: the owner's own time zone, short, in plain words.
const when = (iso: string, o: Intl.DateTimeFormatOptions): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-GB", o);
};

/** "2 Nov, 10:30" */
export const formatWhen = (iso: string): string => when(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
/** "2 Nov" */
export const formatDay = (iso: string): string => when(iso, { day: "numeric", month: "short" });
/** "10:30" */
export const formatTime = (iso: string): string => when(iso, { hour: "2-digit", minute: "2-digit" });
/** The calendar day (local) a timestamp falls on, as a sortable key. */
export const dayKey = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "unknown" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** "Round 2" or, when the owner gave it a name, "Round 2 · Direction B". */
export function roundTitle(r: { number: number; label: string }): string {
  return r.label && r.label !== `Round ${r.number}` ? `Round ${r.number} · ${r.label}` : `Round ${r.number}`;
}
