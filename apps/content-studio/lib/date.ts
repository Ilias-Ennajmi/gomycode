export const DAY_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

export function toKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(key: string) {
  return new Date(key + "T00:00:00");
}

export function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function mondayOf(d: Date) {
  const day = (d.getDay() + 6) % 7;
  return addDays(d, -day);
}

export function todayKey() {
  return toKey(new Date());
}

export function fmtRange(monday: Date) {
  const end = addDays(monday, 6);
  const fmt = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  return `${fmt(monday)} – ${fmt(end)}`;
}
