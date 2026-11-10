// deno test supabase/functions/_tests  (no network: Auth and the database are faked)
import { assert, assertEquals, assertMatch, assertNotEquals } from "jsr:@std/assert@1";
import { cleanInputs } from "../_shared/embed.ts";
import { ALPHABET, derive, EMAIL_DOMAIN, formatCode, generateCode, normalizeCode } from "../_shared/recovery_code.ts";
import { makeHandler as embedHandler } from "../stash-embed/handler.ts";
import { type Deps, makeHandler as recoveryHandler, type Session } from "../stash-recovery/handler.ts";

const UID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const code = async (r: Response) => [r.status, (await r.json()).error];

/** A fixed-window counter like stash.rate_limit_take. */
function limiter() {
  const counts = new Map<string, number>();
  const seen: string[] = [];
  const take = (subject: string, bucket: string, max: number, _windowS: number) => {
    seen.push(`${subject}|${bucket}|${max}|${_windowS}`);
    const n = (counts.get(subject + bucket) ?? 0) + 1;
    counts.set(subject + bucket, n);
    return Promise.resolve(n <= max);
  };
  return { take, seen };
}

// --- stash-embed ----------------------------------------------------------------------------

function embedSetup() {
  const lim = limiter();
  const handler = embedHandler({
    userId: (token) => Promise.resolve(token === "good-jwt" ? UID : null),
    rateLimitTake: lim.take,
    embed: (inputs, max) => Promise.resolve(inputs.map((t) => [Math.min(t.length, max), ...new Array(383).fill(0)])),
  });
  const post = (body: unknown, token: string | null = "good-jwt") =>
    handler(new Request("https://p.supabase.co/functions/v1/stash-embed", {
      method: "POST",
      body: JSON.stringify(body),
      headers: token ? { authorization: `Bearer ${token}`, "content-type": "application/json" } : {},
    }));
  return { handler, post, lim };
}

Deno.test("embed: a string or up to 4 strings in, 384 numbers each out, cut to 1000 characters", async () => {
  const { post, lim } = embedSetup();
  const one = await post({ input: "decoy pricing" });
  assertEquals(one.headers.get("access-control-allow-origin"), "*");
  const body = await one.json();
  assertEquals([body.model, body.dims, body.embeddings.length, body.embeddings[0].length], ["gte-small", 384, 1, 384]);
  const many = await (await post({ input: ["a", "b", "c", "x".repeat(3000)] })).json();
  assertEquals([many.embeddings.length, many.embeddings[3][0]], [4, 1000]);
  assertEquals(lim.seen[0], `u:${UID}|embed|60|60`);
  for (const bad of [{ input: ["1", "2", "3", "4", "5"] }, { input: [] }, { input: "" }, { input: 5 }, { input: ["a", null] }, {}]) {
    assertEquals(await code(await post(bad)), [400, "bad_request"]);
  }
});

Deno.test("embed: no session, a bad token or an anon key is 401; the 61st call in a minute is 429", async () => {
  const { post, handler } = embedSetup();
  assertEquals(await code(await post({ input: "x" }, null)), [401, "unauthorized"]);
  assertEquals(await code(await post({ input: "x" }, "anon-key-jwt")), [401, "unauthorized"]);
  for (let i = 0; i < 60; i++) assertEquals((await post({ input: "x" })).status, 200);
  const limited = await post({ input: "x" });
  assertEquals(await code(limited), [429, "rate_limited"]);
  assertEquals(limited.headers.get("access-control-allow-origin"), "*");
  const options = await handler(new Request("https://p.supabase.co/functions/v1/stash-embed", { method: "OPTIONS" }));
  assertEquals([options.status, options.headers.get("access-control-allow-headers")], [204, "authorization, x-client-info, apikey, content-type"]);
  assertEquals((await handler(new Request("https://p.supabase.co/functions/v1/stash-embed"))).status, 405);
  assertEquals(cleanInputs("x", 16, false), null); // the proxy's /embed takes arrays only
});

// --- recovery codes ---------------------------------------------------------------------------

Deno.test("codes: 20 Crockford characters from 100 random bits, shown in four groups", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const c = generateCode();
    assertEquals(c.length, 20);
    for (const ch of c) assert(ALPHABET.includes(ch));
    seen.add(c);
  }
  assertEquals(seen.size, 200);
  assertEquals(generateCode((b) => b.fill(0)), "0".repeat(20));
  assertEquals(generateCode((b) => b.fill(255)), "Z".repeat(20));
  assertEquals(formatCode("ABCDE12345FGHJK67890"), "ABCDE-12345-FGHJK-67890");
});

Deno.test("codes: typed back loosely, they normalise to the same thing or to nothing", () => {
  assertEquals(normalizeCode(" abcde-12345 fghjk_67890 "), "ABCDE12345FGHJK67890");
  assertEquals(normalizeCode("OIL00-OIL00-OIL00-OIL00"), "01100011000110001100");
  for (const bad of ["", "ABCDE-12345", "ABCDE-12345-FGHJK-67890-X", "UUUUU-UUUUU-UUUUU-UUUUU", 42, null, "A".repeat(81)]) {
    assertEquals(normalizeCode(bad), null);
  }
});

Deno.test("codes: lookup, password and email derive from the code alone, as the contract writes them", async () => {
  const d = await derive("ABCDE12345FGHJK67890");
  // Independent check with the same primitives spelled out.
  const sha = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("stash-recovery/v1/id/ABCDE12345FGHJK67890")));
  assertEquals(d.lookup, [...sha].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32));
  assertMatch(d.lookup, /^[0-9a-f]{32}$/); // stash.recovery.lookup's check
  assertEquals(d.email, `${d.lookup}@${EMAIL_DOMAIN}`);
  assertMatch(d.password, /^[A-Za-z0-9_-]{43}$/); // base64url of 32 bytes, no padding
  assertEquals(await derive("ABCDE12345FGHJK67890"), d);
  const other = await derive("ABCDE12345FGHJK67891");
  assertNotEquals(other.lookup, d.lookup);
  assertNotEquals(other.password, d.password);
});

// --- stash-recovery -----------------------------------------------------------------------------

function recoverySetup(over: Partial<Deps> = {}) {
  const lim = limiter();
  // A tiny Auth + stash.recovery
  const users = new Map<string, { email?: string; password?: string }>([[UID, {}]]);
  const lookups = new Map<string, string>(); // lookup -> uid (one row per user)
  const log: string[] = [];
  let n = 0;
  const codes = ["AAAAABBBBBCCCCCDDDDD", "22222333334444455555", "66666777778888899999"];
  const handler = recoveryHandler({
    userId: (token) => Promise.resolve(token === "device-jwt" ? UID : null),
    rateLimitTake: lim.take,
    setCredentials: (uid, email, password) => {
      log.push("setCredentials");
      users.set(uid, { email, password });
      return Promise.resolve(true);
    },
    recoverySet: (uid, lookup) => {
      log.push("recoverySet");
      for (const [k, v] of lookups) if (v === uid) lookups.delete(k);
      lookups.set(lookup, uid);
      return Promise.resolve();
    },
    recoveryFind: (lookup) => Promise.resolve(lookups.get(lookup) ?? null),
    emailOf: (uid) => Promise.resolve(users.get(uid)?.email ?? null),
    signIn: (email, password): Promise<Session | null> => {
      const hit = [...users].find(([, u]) => u.email === email && u.password === password);
      return Promise.resolve(hit ? { access_token: "at", refresh_token: "rt", expires_at: 123, user_id: hit[0] } : null);
    },
    generateCode: () => codes[n++ % codes.length],
    now: () => new Date("2026-11-10T12:00:00Z"),
    ...over,
  });
  const post = (body: unknown, opts: { token?: string; ip?: string } = {}) =>
    handler(new Request("https://p.supabase.co/functions/v1/stash-recovery", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "x-forwarded-for": `${opts.ip ?? "203.0.113.7"}, 10.0.0.1`, ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
    }));
  return { handler, post, lim, users, lookups, log };
}

Deno.test("recovery: create gives a code once; restore with it returns a session for the same user", async () => {
  const { post, users, lookups, lim, log } = recoverySetup();
  const created = await post({ action: "create" }, { token: "device-jwt" });
  assertEquals(await created.json(), { code: "AAAAA-BBBBB-CCCCC-DDDDD", created_at: "2026-11-10T12:00:00.000Z" });
  assertEquals(log, ["setCredentials", "recoverySet"]);
  assertEquals(lim.seen[0], `u:${UID}|recovery_create|5|86400`);
  // What is stored: a synthetic email, a password, a lookup id. Never the code.
  const stored = JSON.stringify([...users, ...lookups]);
  assert(!stored.includes("AAAAABBBBB") && users.get(UID)!.email!.endsWith("@recovery.stash.invalid"));

  const restored = await post({ action: "restore", code: "aaaaa bbbbb ccccc ddddd" }); // typed loosely, no session
  assertEquals(await restored.json(), { access_token: "at", refresh_token: "rt", expires_at: 123, user_id: UID });
  assertEquals(restored.headers.get("access-control-allow-origin"), "*");
  assertMatch(lim.seen[1], /^ip:[0-9a-f]{32}\|recovery_restore\|10\|3600$/);
  assert(!lim.seen[1].includes("203.0.113.7")); // the address itself is not kept
});

Deno.test("recovery: rotating makes the old code useless; wrong codes all look the same", async () => {
  const { post } = recoverySetup();
  await post({ action: "create" }, { token: "device-jwt" });
  const second = await (await post({ action: "create" }, { token: "device-jwt" })).json();
  assertEquals(second.code, "22222-33333-44444-55555");
  assertEquals(await code(await post({ action: "restore", code: "AAAAA-BBBBB-CCCCC-DDDDD" })), [404, "not_found"]);
  assertEquals(await code(await post({ action: "restore", code: "ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ" })), [404, "not_found"]);
  assertEquals((await post({ action: "restore", code: second.code })).status, 200);
  assertEquals(await code(await post({ action: "restore", code: "too-short" })), [400, "invalid_code"]);
  assertEquals(await code(await post({ action: "restore" })), [400, "invalid_code"]);
});

Deno.test("recovery: a lookup that points at a user whose password does not match is still 404", async () => {
  // e.g. recovery_set landed but the Auth update belongs to another code
  const { post, users } = recoverySetup();
  await post({ action: "create" }, { token: "device-jwt" });
  users.get(UID)!.password = "something else";
  assertEquals(await code(await post({ action: "restore", code: "AAAAA-BBBBB-CCCCC-DDDDD" })), [404, "not_found"]);
});

Deno.test("recovery: create needs the device's own session and is limited per user", async () => {
  const { post, log } = recoverySetup();
  assertEquals(await code(await post({ action: "create" })), [401, "unauthorized"]);
  assertEquals(await code(await post({ action: "create" }, { token: "forged" })), [401, "unauthorized"]);
  assertEquals(log, []);
  for (let i = 0; i < 5; i++) assertEquals((await post({ action: "create" }, { token: "device-jwt" })).status, 200);
  assertEquals(await code(await post({ action: "create" }, { token: "device-jwt" })), [429, "rate_limited"]);
  assertEquals(log.length, 10); // the sixth changed nothing
});

Deno.test("recovery: the 11th restore attempt in an hour from one address is 429, others are not affected", async () => {
  const { post } = recoverySetup();
  for (let i = 0; i < 10; i++) assertEquals((await post({ action: "restore", code: "ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ" })).status, 404);
  assertEquals(await code(await post({ action: "restore", code: "ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ" })), [429, "rate_limited"]);
  assertEquals(await code(await post({ action: "restore", code: "garbage" })), [429, "rate_limited"]); // counted before the code is read
  assertEquals((await post({ action: "restore", code: "ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ" }, { ip: "198.51.100.9" })).status, 404);
});

Deno.test("recovery: Auth refusing the update is reported and stores nothing; odd requests are refused", async () => {
  const { post, lookups, handler } = recoverySetup({ setCredentials: () => Promise.resolve(false) });
  assertEquals(await code(await post({ action: "create" }, { token: "device-jwt" })), [500, "auth_update_failed"]);
  assertEquals(lookups.size, 0);
  assertEquals(await code(await post({ action: "delete-everything" })), [400, "bad_request"]);
  assertEquals(await code(await post("not json")), [400, "bad_request"]);
  assertEquals(await code(await post({ action: "restore", code: "x".repeat(5000) })), [413, "too_large"]);
  assertEquals((await handler(new Request("https://p.supabase.co/functions/v1/stash-recovery", { method: "GET" }))).status, 405);
  const options = await handler(new Request("https://p.supabase.co/functions/v1/stash-recovery", { method: "OPTIONS" }));
  assertEquals([options.status, options.headers.get("access-control-allow-origin")], [204, "*"]);
});
