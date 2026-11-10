/*
 * SM-2 spaced repetition for recall cards, plus the daily cap.
 * Grades 0..5; the three buttons map Got it = 5, Partly = 3, Missed = 1.
 * The worker (worker/stash_worker/rules.py: sm2) mirrors this exactly.
 */

export type Verdict = "got" | "partly" | "missed";

export const VERDICT_GRADE: Record<Verdict, number> = { got: 5, partly: 3, missed: 1 };
export const VERDICT_LABEL: Record<Verdict, string> = { got: "Got it", partly: "Partly", missed: "Missed" };

export const MIN_EASE = 1.3;
export const DAILY_CAP = 10;

export type CardSchedule = { ease: number; intervalDays: number; repetitions: number };
export type Scheduled = CardSchedule & { dueAt: string };

export function verdictFromGrade(grade: number): Verdict {
  if (grade >= 4) return "got";
  if (grade >= 3) return "partly";
  return "missed";
}

export function sm2(card: CardSchedule, grade: number, now = new Date()): Scheduled {
  const q = Math.max(0, Math.min(5, Math.round(grade)));
  let { ease, intervalDays, repetitions } = card;
  ease = Number.isFinite(ease) && ease > 0 ? ease : 2.5;

  if (q < 3) {
    // Forgotten: start over tomorrow; ease still drops.
    repetitions = 0;
    intervalDays = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 6;
    else intervalDays = Math.max(1, Math.round(intervalDays * ease));
  }
  ease = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  ease = Math.max(MIN_EASE, Math.round(ease * 100) / 100);

  const due = new Date(now.getTime() + intervalDays * 86_400_000);
  return { ease, intervalDays, repetitions, dueAt: due.toISOString() };
}

/** How many more cards may be shown today, given how many were answered today. */
export function remainingToday(answeredToday: number, cap = DAILY_CAP): number {
  return Math.max(0, cap - answeredToday);
}

/** Due cards first by due date, capped for the day. */
export function dueToday<T extends { dueAt: string }>(cards: T[], answeredToday: number, now = new Date(), cap = DAILY_CAP): T[] {
  return cards
    .filter((c) => Date.parse(c.dueAt) <= now.getTime())
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))
    .slice(0, remainingToday(answeredToday, cap));
}
