import { test } from "node:test";
import assert from "node:assert/strict";
import { isSealed, open, seal } from "@/lib/secret-box";
import { openChallenge, sealChallenge } from "@/lib/passkeys";
import { voiceCheckDue } from "@/lib/voice-check";

process.env.AUTH_SECRET = "test-secret";
process.env.APP_PASSWORD = "test-password";

test("a sealed secret comes back, and never looks like itself", () => {
  const sealed = seal("ntn_abc123");
  assert.ok(isSealed(sealed));
  assert.ok(!sealed.includes("ntn_abc123"));
  assert.equal(open(sealed), "ntn_abc123");
  assert.notEqual(seal("ntn_abc123"), sealed);
});

test("a sealed secret that was changed, or sealed with another key, can't be read", () => {
  const sealed = seal("secret");
  const tampered = sealed.slice(0, -2) + (sealed.endsWith("A") ? "B" : "A") + "A";
  assert.equal(open(tampered), null);
  assert.equal(open("plain text"), null);
  process.env.AUTH_SECRET = "another";
  assert.equal(open(sealed), null);
  process.env.AUTH_SECRET = "test-secret";
  assert.equal(open(sealed), "secret");
});

test("a passkey challenge cookie is only good when it's ours and fresh", async () => {
  const cookie = await sealChallenge("abc-challenge");
  assert.equal(await openChallenge(cookie), "abc-challenge");
  const [challenge, expires, signature] = cookie.split(".");
  assert.equal(await openChallenge(`other.${expires}.${signature}`), null);
  assert.equal(await openChallenge(`${challenge}.${Number(expires) + 60_000}.${signature}`), null);
  assert.equal(await openChallenge(undefined), null);
  const realNow = Date.now;
  Date.now = () => realNow() + 6 * 60 * 1000;
  assert.equal(await openChallenge(cookie), null);
  Date.now = realNow;
});

test("the voice check runs once, then weekly while it works, twice a day while it doesn't", () => {
  const now = Date.now();
  const hour = 3_600_000;
  assert.equal(voiceCheckDue({ ok: null, at: 0, detail: "" }, now), true);
  assert.equal(voiceCheckDue({ ok: true, at: now - 24 * hour, detail: "" }, now), false);
  assert.equal(voiceCheckDue({ ok: true, at: now - 8 * 24 * hour, detail: "" }, now), true);
  assert.equal(voiceCheckDue({ ok: false, at: now - 2 * hour, detail: "" }, now), false);
  assert.equal(voiceCheckDue({ ok: false, at: now - 13 * hour, detail: "" }, now), true);
});
