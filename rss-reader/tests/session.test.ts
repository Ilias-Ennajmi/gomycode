import { test } from "node:test";
import assert from "node:assert/strict";
import { fillBudget, minutesLeft } from "@/lib/session";
import type { ArticleSummary } from "@/lib/types";

const base = { isVideo: false, audioUrl: null, readProgress: 0, isShort: false } as const;
const article = (id: string, extra: Partial<ArticleSummary>) =>
  ({ ...base, id, ...extra }) as unknown as ArticleSummary;

test("minutes left counts what's unread or unplayed", () => {
  assert.equal(minutesLeft(article("a", { readingMinutes: 10, readProgress: 50 })), 5);
  assert.equal(
    minutesLeft(article("b", { audioUrl: "x.mp3", durationSeconds: 600, watchedSeconds: 300 })),
    5
  );
  assert.equal(minutesLeft(article("c", { isVideo: true, durationSeconds: null })), null);
});

test("fillBudget keeps order, skips what doesn't fit, shorts and duplicates", () => {
  const { picks, total } = fillBudget(
    [
      article("long", { readingMinutes: 12 }),
      article("a", { readingMinutes: 2 }),
      article("a", { readingMinutes: 2 }),
      article("short", { isVideo: true, isShort: true, durationSeconds: 30 }),
      article("b", { readingMinutes: 3 }),
    ],
    5
  );
  assert.deepEqual(
    picks.map((p) => p.article.id),
    ["a", "b"]
  );
  assert.equal(total, 5);
});
