import { test } from "node:test";
import assert from "node:assert/strict";
import { FEATURES, matchFeatures } from "@/components/layout/FeaturesSheet";
import { FR } from "@/lib/i18n";

test("every feature and its place has a French version", () => {
  const missing = FEATURES.flatMap((f) => [f.title, f.where]).filter((text) => !(text in FR));
  assert.deepEqual(missing, []);
});

test("features are found by name, place, extra words, and in French", () => {
  assert.ok(matchFeatures("offline").some((f) => f.title === "Download episodes"));
  assert.ok(matchFeatures("fingerprint").some((f) => f.title === "Unlock with a passkey"));
  const french = (text: string) => FR[text] ?? text;
  assert.ok(matchFeatures("voiture", french).some((f) => f.title === "Car mode"));
  assert.equal(matchFeatures("zzzz").length, 0);
  assert.equal(matchFeatures("").length, FEATURES.length);
});
