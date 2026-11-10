// deno test supabase/functions/_tests  (no network: Supabase is faked)
import { assert, assertEquals } from "jsr:@std/assert@1";
import { hasFilter, restVerdict, routeOf, selectOk, storageVerdict } from "../_shared/proxy_rules.ts";
import { type Deps, makeHandler } from "../stash-worker-proxy/handler.ts";

const TOKEN = "a".repeat(64);
const SERVICE = "service-role-key-never-leaves";
const UID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const BASE = "https://proj.supabase.co/functions/v1/stash-worker-proxy";

type Call = { url: string; method: string; headers: Record<string, string>; body: string };

function setup(over: Partial<Deps> = {}) {
  const calls: Call[] = [];
  const state = { tokenChecks: 0, now: 1_000_000, dbDown: false };
  const fakeFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const body = init?.body ? (typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as ArrayBuffer)) : "";
    if (url.endsWith("/rpc/worker_token_ok")) {
      state.tokenChecks++;
      if (state.dbDown) return new Response("down", { status: 500 });
      return Response.json(JSON.parse(String(init?.body)).p_token === TOKEN);
    }
    calls.push({ url, method: init?.method ?? "GET", headers, body });
    if (url.endsWith("/rpc/worker_config")) {
      return Response.json({ owner_ids: [UID], keys: { gemini: "g-key", groq: null, anthropic: null }, instagram_cookies_b64: null, config: { ai_provider: "auto" } });
    }
    return new Response('[{"id":1}]', { status: 200, headers: { "content-type": "application/json", "content-range": "0-0/*", "x-internal": "secret" } });
  };
  const handler = makeHandler({
    supabaseUrl: "https://proj.supabase.co",
    serviceKey: SERVICE,
    anonKey: "anon-key",
    fetch: fakeFetch as typeof fetch,
    signUpload: (bucket, path) => Promise.resolve({ url: `https://proj.supabase.co/storage/v1/object/upload/sign/${bucket}/${path}?token=t`, token: "t", path }),
    signDownload: (bucket, path, expires) => Promise.resolve(`https://proj.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=d&e=${expires}`),
    remove: (_b, paths) => Promise.resolve(paths.length),
    embed: (inputs, max) => Promise.resolve(inputs.map((t) => [Math.min(t.length, max), ...new Array(383).fill(0)])),
    now: () => state.now,
    ...over,
  });
  const call = (path: string, init: RequestInit & { token?: string | null } = {}) => {
    const headers = new Headers(init.headers);
    if (init.token !== null) headers.set("x-stash-worker-token", init.token ?? TOKEN);
    return handler(new Request(BASE + path, { ...init, headers }));
  };
  const post = (path: string, body: unknown, token?: string | null) =>
    call(path, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" }, token });
  return { call, post, calls, state };
}

const code = async (r: Response) => [r.status, (await r.json()).error];

Deno.test("a missing, short, wrong or prefix token is refused before anything else", async () => {
  const { call, calls, state } = setup();
  for (const token of [null, "", "short", "b".repeat(64), TOKEN.slice(0, 40), TOKEN + "x"]) {
    assertEquals(await code(await call("/rest/saves?select=id", { token })), [401, "unauthorized"]);
  }
  assertEquals(calls.length, 0); // nothing was forwarded
  assertEquals(state.tokenChecks, 3); // the short ones never reach the database
});

Deno.test("the token check is cached for 60 s by its hash, and a database error is not a yes", async () => {
  const { call, state } = setup();
  await call("/rest/saves?select=id");
  await call("/rest/saves?select=id");
  assertEquals(state.tokenChecks, 1);
  state.now += 61_000;
  await call("/rest/saves?select=id");
  assertEquals(state.tokenChecks, 2);
  const down = setup();
  down.state.dbDown = true;
  assertEquals(await code(await down.call("/rest/saves?select=id")), [503, "unavailable"]);
  assertEquals(down.calls.length, 0);
});

Deno.test("rest calls are relayed to schema stash with the service key and only three caller headers", async () => {
  const { call, calls } = setup();
  const r = await call("/rest/saves?select=id,insights(title)&id=eq.1", {
    headers: { Prefer: "return=minimal", Range: "0-9", "Accept-Profile": "public", "Content-Profile": "auth", Authorization: "Bearer evil", apikey: "evil", "X-Other": "x" },
  });
  assertEquals(r.status, 200);
  assertEquals(await r.json(), [{ id: 1 }]);
  assertEquals(r.headers.get("content-range"), "0-0/*");
  assertEquals(r.headers.get("x-internal"), null);
  const c = calls[0];
  assertEquals(c.url, "https://proj.supabase.co/rest/v1/saves?select=id,insights(title)&id=eq.1");
  assertEquals(c.headers["accept-profile"], "stash");
  assertEquals(c.headers["content-profile"], "stash");
  assertEquals(c.headers["authorization"], `Bearer ${SERVICE}`);
  assertEquals(c.headers["apikey"], SERVICE);
  assertEquals(c.headers["prefer"], "return=minimal");
  assertEquals(c.headers["range"], "0-9");
  assertEquals(c.headers["x-other"], undefined);
  assertEquals(c.headers["x-stash-worker-token"], undefined); // the token stops here

  await call("/rest/saves?id=eq.1", { method: "PATCH", body: '{"status":"ready"}', headers: { "content-type": "application/json" } });
  assertEquals([calls[1].method, calls[1].body], ["PATCH", '{"status":"ready"}']);
  await call("/rest/rpc/claim_jobs", { method: "POST", body: '{"p_limit":1}' });
  assertEquals(calls[2].url, "https://proj.supabase.co/rest/v1/rpc/claim_jobs");
});

Deno.test("anything off the allowlist is 403; an unfiltered PATCH or DELETE is 400", async () => {
  const { call, post, calls } = setup();
  const forbidden = [
    "/rest/config", "/rest/recovery", "/rest/rate_limits", "/rest/push_subscriptions", "/rest/rpc/worker_config",
    "/rest/rpc/worker_token_ok", "/rest/rpc/recovery_find", "/rest/rpc/owner_ids", "/rest/users", "/rest/",
    "/rest/saves/../config", "/rest/saves%2F..%2Fconfig", "/rest/saves?select=*,config(*)", "/rest/saves?select=id,x:recovery!inner(lookup)",
    "/rest/saves?select=id&select=*,rate_limits(*)", "/auth/v1/admin/users", "/storage/v1/object/x", "/nothing", "",
  ];
  for (const path of forbidden) {
    const r = await (path.startsWith("/rest") ? call(path) : post(path, {}));
    assertEquals(await code(r), [403, "forbidden"], path);
  }
  assertEquals(await code(await call("/rest/saves", { method: "DELETE" })), [400, "filter_required"]);
  assertEquals(await code(await call("/rest/saves?select=id&order=id&limit=5", { method: "PATCH", body: "{}" })), [400, "filter_required"]);
  assertEquals(await code(await call("/rest/rpc/claim_jobs")), [405, "method_not_allowed"]);
  assertEquals(await code(await call("/rest/saves", { method: "PUT", body: "{}" })), [405, "method_not_allowed"]);
  assertEquals(calls.length, 0);
});

Deno.test("storage: only our buckets and paths inside a user's folder", async () => {
  const { post } = setup();
  const good = { bucket: "stash-video", path: `${UID}/a1b2.mp4` };
  assertEquals(await (await post("/storage/sign-upload", good)).json(), {
    url: `https://proj.supabase.co/storage/v1/object/upload/sign/stash-video/${UID}/a1b2.mp4?token=t`, token: "t", path: good.path,
  });
  const down = await (await post("/storage/sign-download", { ...good, expires_in: 99999 })).json();
  assert(down.url.endsWith("e=3600")); // clamped
  assert((await (await post("/storage/sign-download", good)).json()).url.endsWith("e=600"));
  assertEquals(await (await post("/storage/remove", { bucket: "stash-thumbs", paths: [`${UID}/a.jpg`, `${UID}/screenshots/b.jpg`] })).json(), { removed: 2 });

  for (const bad of [
    { bucket: "avatars", path: good.path }, { bucket: "stash-video", path: `${UID}/../other/x.mp4` },
    { bucket: "stash-video", path: "x.mp4" }, { bucket: "stash-video", path: `/${UID}/x.mp4` },
    { bucket: "stash-video", path: `${UID}/a b.mp4` }, { bucket: "stash-video", path: `${UID}/` },
    { bucket: "stash-video", path: `${UID}/x?y=1` }, { bucket: "stash-video" }, { path: good.path },
    { bucket: "stash-video", path: `${UID}/${"a".repeat(201)}` }, { bucket: ["stash-video"], path: good.path },
  ]) {
    assertEquals(await code(await post("/storage/sign-upload", bad)), [403, "forbidden"], JSON.stringify(bad));
    assertEquals(await code(await post("/storage/sign-download", bad)), [403, "forbidden"]);
  }
  assertEquals(await code(await post("/storage/remove", { bucket: "stash-video", paths: [good.path, `${UID}/../x`] })), [403, "forbidden"]);
  assertEquals(await code(await post("/storage/remove", { bucket: "stash-video", paths: new Array(101).fill(good.path) })), [400, "bad_request"]);
  assertEquals(await code(await post("/storage/remove", { bucket: "stash-video", paths: [] })), [400, "bad_request"]);
});

Deno.test("config adds the public url and anon key; embed follows the contract's shape", async () => {
  const { post, calls } = setup();
  const cfg = await (await post("/config", {})).json();
  assertEquals(cfg.supabase_url, "https://proj.supabase.co");
  assertEquals(cfg.anon_key, "anon-key");
  assertEquals(cfg.keys.gemini, "g-key");
  assertEquals(cfg.owner_ids, [UID]);
  assertEquals(calls[0].headers["content-profile"], "stash");

  const e = await (await post("/embed", { input: ["hello", "x".repeat(5000)] })).json();
  assertEquals([e.model, e.dims, e.embeddings.length, e.embeddings[0].length], ["gte-small", 384, 2, 384]);
  assertEquals(e.embeddings[1][0], 2000); // cut to 2000 characters
  for (const bad of [{ input: "a string" }, { input: [] }, { input: new Array(17).fill("x") }, { input: ["ok", 3] }, {}]) {
    assertEquals(await code(await post("/embed", bad)), [400, "bad_request"]);
  }
});

Deno.test("bodies over 1 MB are refused, errors tell nothing, OPTIONS carries no CORS", async () => {
  const { call, post } = setup({ signUpload: () => Promise.reject(new Error(`boom ${SERVICE}`)) });
  const big = "x".repeat(1024 * 1024 + 10);
  assertEquals(await code(await call("/rest/usage", { method: "POST", body: big })), [413, "too_large"]);
  assertEquals(await code(await post("/embed", { input: [big] })), [413, "too_large"]);
  const r = await post("/storage/sign-upload", { bucket: "stash-video", path: `${UID}/a.mp4` });
  const text = await r.text();
  assertEquals([r.status, text], [500, '{"error":"internal"}']);
  const o = await call("/rest/saves", { method: "OPTIONS", token: null });
  assertEquals([o.status, o.headers.get("access-control-allow-origin")], [204, null]);
  assertEquals(await code(await call("/config")), [405, "method_not_allowed"]);
});

Deno.test("rules: routes, selects, filters, paths", () => {
  assertEquals(routeOf("/functions/v1/stash-worker-proxy/rest/saves"), "/rest/saves");
  assertEquals(routeOf("/stash-worker-proxy/config/"), "/config");
  assertEquals(routeOf("/stash-worker-proxy-evil/config"), "");
  assertEquals(routeOf("/other/config"), "");
  assert(selectOk("id,insights(title,key_idea),states!inner(kept)") && selectOk("*") && selectOk(null));
  assert(!selectOk("id,config(*)") && !selectOk("usd.sum()") && !selectOk("a:recovery ( lookup )") && !selectOk("x".repeat(2001)));
  const q = (s: string) => new URLSearchParams(s);
  assert(hasFilter(q("id=eq.1")) && hasFilter(q("id=in.(1,2)")) && hasFilter(q("space_id=is.null&select=id")) && hasFilter(q("or=(a.eq.1,b.eq.2)")) && hasFilter(q("id=not.eq.1")));
  assert(!hasFilter(q("")) && !hasFilter(q("select=id&limit=1&order=id&offset=2&on_conflict=id&columns=a")) && !hasFilter(q("id=")) && !hasFilter(q("id=1")) && !hasFilter(q("insights.tags=cs.{a}")));
  assertEquals(restVerdict("saves", "GET", q("select=*")), { ok: true });
  assertEquals(restVerdict("rpc/evict_videos", "POST", q("")), { ok: true });
  assertEquals(storageVerdict("stash-exports", `${UID}/backups/2026-11-08.json`), { ok: true });
  assertEquals(storageVerdict("stash-voice", `${UID}/answers/c1-1.webm`), { ok: true });
});
