/** Snooze choices, in the reader's own time zone. */
export interface SnoozeOption {
  id: string;
  label: string;
  until: Date;
}

function at(base: Date, daysAhead: number, hour: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function daysUntil(now: Date, weekday: number) {
  const diff = (weekday - now.getDay() + 7) % 7;
  return diff === 0 ? 7 : diff;
}

export function snoozeOptions(now = new Date()): SnoozeOption[] {
  const options: SnoozeOption[] = [];
  if (now.getHours() < 16) {
    options.push({ id: "evening", label: "This evening", until: at(now, 0, 18) });
  } else {
    options.push({ id: "later", label: "In 3 hours", until: new Date(now.getTime() + 3 * 3600e3) });
  }
  options.push({ id: "tomorrow", label: "Tomorrow morning", until: at(now, 1, 8) });
  const weekend = now.getDay() === 6 || now.getDay() === 0;
  if (!weekend) {
    options.push({ id: "weekend", label: "This weekend", until: at(now, daysUntil(now, 6), 9) });
  }
  options.push({ id: "week", label: "Next week", until: at(now, daysUntil(now, 1), 8) });
  options.push({ id: "month", label: "In a month", until: at(now, 30, 8) });
  return options;
}

/** "Today 18:00", "Tomorrow 08:00", "Sat 09:00", "Oct 29" */
export function formatSnooze(date: Date | string, now = new Date()) {
  const d = typeof date === "string" ? new Date(date) : date;
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const days = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86400000
  );
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Tomorrow ${time}`;
  if (days < 7) return `${d.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
