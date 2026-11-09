import { test } from "node:test";
import assert from "node:assert/strict";
import { isCoarseTranscript } from "@/lib/video-ai";

test("paragraph transcripts are coarse, sentence ones aren't", () => {
  const paragraphs = [0, 26, 51, 77, 103].map((t) => ({ t, text: "A long paragraph." }));
  const sentences = [0, 3, 7, 9, 14, 30, 33].map((t) => ({ t, text: "A sentence." }));
  assert.equal(isCoarseTranscript(paragraphs), true);
  assert.equal(isCoarseTranscript(sentences), false);
  assert.equal(isCoarseTranscript([]), false);
  assert.equal(isCoarseTranscript(null), false);
});
