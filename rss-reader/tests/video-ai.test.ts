import { test } from "node:test";
import assert from "node:assert/strict";
import { isCoarseTranscript, mergeTranscripts } from "@/lib/video-ai";
import { salvageJsonInfo } from "@/lib/json-salvage";

test("paragraph transcripts are coarse, sentence ones aren't", () => {
  const paragraphs = [0, 26, 51, 77, 103].map((t) => ({ t, text: "A long paragraph." }));
  const sentences = [0, 3, 7, 9, 14, 30, 33].map((t) => ({ t, text: "A sentence." }));
  assert.equal(isCoarseTranscript(paragraphs), true);
  assert.equal(isCoarseTranscript(sentences), false);
  assert.equal(isCoarseTranscript([]), false);
  assert.equal(isCoarseTranscript(null), false);
});

test("a cut-off answer says so, a whole one doesn't", () => {
  assert.equal(salvageJsonInfo('{"transcript":[{"t":"0:01","text":"a"},{"t":"0:0').complete, false);
  assert.equal(salvageJsonInfo('Here: {"transcript":[{"t":"0:01","text":"a"}]}').complete, true);
});

test("a continuation joins on after the last line, without repeating it", () => {
  const base = [
    { t: 0, text: "One." },
    { t: 5, text: "Two." },
  ];
  const more = [
    { t: 5, text: "Two." },
    { t: 9, text: "Three." },
    { t: 14, text: "Four." },
  ];
  assert.deepEqual(
    mergeTranscripts(base, more).map((l) => l.text),
    ["One.", "Two.", "Three.", "Four."]
  );
  // A different sentence in the same second is kept.
  assert.equal(mergeTranscripts(base, [{ t: 5, text: "Also." }]).length, 3);
  assert.equal(mergeTranscripts([], more).length, 3);
});
