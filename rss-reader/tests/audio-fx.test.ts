import { test } from "node:test";
import assert from "node:assert/strict";
import { isSilent } from "@/lib/audio-fx";

test("quiet room tone counts as silence, speech doesn't", () => {
  const quiet = new Float32Array(2048).map((_, i) => 0.003 * Math.sin(i / 7));
  const speech = new Float32Array(2048).map((_, i) => 0.2 * Math.sin(i / 5));
  assert.equal(isSilent(quiet), true);
  assert.equal(isSilent(speech), false);
});
