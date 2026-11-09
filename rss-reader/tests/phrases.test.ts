import { test } from "node:test";
import assert from "node:assert/strict";
import { phraseAt, splitPhrases, toPhrases } from "@/lib/phrases";

test("a short sentence stays whole", () => {
  assert.deepEqual(splitPhrases("Welcome back to the show."), ["Welcome back to the show."]);
});

test("long sentences split at clauses, then into runs of a few words", () => {
  const parts = splitPhrases(
    "Today we're talking about sleep, why it matters for memory, and what you can do tonight to get more of the deep kind that your brain actually needs."
  );
  assert.ok(parts.length >= 3);
  for (const part of parts) assert.ok(part.split(" ").length <= 11, part);
  assert.equal(parts.join(" "), parts.join(" ").replace(/\s+/g, " "));
});

test("a short lead-in stays with what follows", () => {
  const parts = splitPhrases("Aujourd'hui, on parle du sommeil profond et de la mémoire.");
  assert.equal(parts[0].startsWith("Aujourd'hui, on parle"), true);
});

test("phrases are timed within their line and never overlap", () => {
  const phrases = toPhrases(
    [
      { t: 0, text: "Welcome to the show. Today we talk about sleep and why it matters." },
      { t: 10, text: "Deep sleep files the day away." },
    ],
    20
  );
  for (let i = 1; i < phrases.length; i++) {
    assert.ok(phrases[i].t >= phrases[i - 1].end - 1e-9, `phrase ${i} starts after the last`);
  }
  assert.equal(phrases.find((p) => p.line === 1)?.t, 10);
});

test("phraseAt finds the phrase being said", () => {
  const phrases = toPhrases(
    [
      { t: 0, text: "One. Two words here." },
      { t: 5, text: "Three." },
    ],
    8
  );
  assert.equal(phraseAt(phrases, -1), -1);
  assert.equal(phrases[phraseAt(phrases, 5.2)].text, "Three.");
});
