// A tiny stand-in for Supabase (REST, RPC, Auth, Storage signing) that serves the fixtures in
// ./data.mjs, so screens can be rendered without a backend. Development only: nothing in the app
// imports it, and it only answers on 127.0.0.1.
//
//   node scripts/fixtures/mock-supabase.mjs [port]      (default 54399)
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=fixture npm run dev
//
// POST /__mode {"mode": …} switches the dataset:
//   full     everything, AI on
//   empty    a first-run account
//   nokey    like full, but no AI key yet (Setup shows the owner step, a question fails with no_ai)
//   limit    like full, but today's questions are used up (insert into asks → SQLSTATE 54000)
//   recovery like full, with a recovery code already made
//
// Contract 0007 pieces mocked here: tables asks / highlights / backups / recovery, RPCs
// auto_collections / pipeline_status, Edge Functions stash-embed and stash-recovery, and the
// stash-video bucket (FIXTURE_VIDEO=<file> is served for every stored video; without it the
// player falls back as it would for a missing file).
//
// stash-recovery restore: a code starting with 00000 answers 404 not_found, one starting with
// 99999 answers 429 rate_limited, any other valid code signs in as the fixture user.
import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
import * as F from "./data.mjs";

const PORT = Number(process.argv[2] || process.env.MOCK_PORT || 54399);
let mode = "full";
const VIDEO = process.env.FIXTURE_VIDEO && existsSync(process.env.FIXTURE_VIDEO) ? readFileSync(process.env.FIXTURE_VIDEO) : null;
// Rows written while the mock runs (questions asked, highlights made); cleared by /__mode.
let asked = [];
let highlighted = [];

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const TOKEN = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: F.USER_ID, role: "authenticated", exp: 4102444800, is_anonymous: true })}.fixture`;
const USER = { id: F.USER_ID, aud: "authenticated", role: "authenticated", is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const SESSION = { access_token: TOKEN, token_type: "bearer", expires_in: 3600 * 24 * 365, expires_at: 4102444800, refresh_token: "fixture-refresh", user: USER };

function tables() {
  const empty = mode === "empty";
  return {
    spaces: empty ? F.SPACES.slice(0, 1) : F.SPACES,
    saves: empty ? [] : F.SAVES,
    insights: empty ? [] : F.SAVES.filter((s) => s.insights).map((s) => ({ save_id: s.id, ...s.insights })),
    cards: empty ? [] : F.CARDS,
    reviews: empty ? [] : F.REVIEWS,
    syntheses: empty ? [] : F.SYNTHESES,
    reminders: empty ? [] : F.REMINDERS,
    settings: [F.SETTINGS],
    places: empty ? [] : F.PLACES,
    galaxy_points: empty ? [] : F.GALAXY_POINTS,
    galaxy_clusters: empty ? [] : F.GALAXY_CLUSTERS,
    galaxy_layouts: empty ? [] : [{ built_at: new Date().toISOString() }],
    transcripts: empty ? [] : F.TRANSCRIPTS,
    asks: empty ? [] : [...asked, ...F.ASKS],
    highlights: empty ? [] : [...highlighted, ...F.HIGHLIGHTS],
    backups: empty ? [] : F.BACKUPS,
    recovery: mode === "recovery" ? [{ user_id: F.USER_ID, created_at: new Date(Date.now() - 12 * 86_400_000).toISOString(), last_restored_at: null }] : [],
    exports: [],
    jobs: [],
    imports: [],
    push_subscriptions: [],
    states: [],
  };
}

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function matches(row, key, raw) {
  if (key.includes(".")) return true; // embedded-resource filters: the fixtures already hold kept rows only
  let neg = false;
  let v = raw;
  if (v.startsWith("not.")) {
    neg = true;
    v = v.slice(4);
  }
  const i = v.indexOf(".");
  const op = v.slice(0, i);
  const val = decodeURIComponent(v.slice(i + 1));
  const cell = row[key];
  let ok = true;
  const cmp = (a, b) => (typeof a === "number" ? a - Number(b) : String(a ?? "").localeCompare(b));
  switch (op) {
    case "eq": ok = String(cell) === val; break;
    case "neq": ok = String(cell) !== val; break;
    case "is": ok = val === "null" ? cell === null || cell === undefined : String(cell) === val; break;
    case "ilike": ok = String(cell ?? "").toLowerCase() === val.replace(/\\/g, "").toLowerCase(); break;
    case "in": ok = val.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, "")).includes(String(cell)); break;
    case "gte": ok = cell != null && cmp(cell, val) >= 0; break;
    case "gt": ok = cell != null && cmp(cell, val) > 0; break;
    case "lte": ok = cell != null && cmp(cell, val) <= 0; break;
    case "lt": ok = cell != null && cmp(cell, val) < 0; break;
    default: ok = true;
  }
  return neg ? !ok : ok;
}

function query(rows, params) {
  let out = rows.filter((r) => [...params].every(([k, v]) => RESERVED.has(k) || matches(r, k, v)));
  const order = params.get("order");
  if (order) {
    const [col, dir] = order.split(",")[0].split(".");
    out = [...out].sort((a, b) => String(a[col] ?? "").localeCompare(String(b[col] ?? "")) * (dir === "desc" ? -1 : 1));
  }
  const limit = Number(params.get("limit"));
  if (limit) out = out.slice(0, limit);
  return out;
}

// The same grouping as stash.auto_collections(): tags, creators and intents with 3+ ready saves, plus Places.
function autoCollections() {
  const groups = new Map();
  const add = (kind, key, s) => {
    const id = `${kind}:${key}`;
    const g = groups.get(id) ?? { kind, key, rows: [] };
    if (!g.rows.includes(s)) g.rows.push(s);
    groups.set(id, g);
  };
  const withPlace = new Set(F.PLACES.map((p) => p.save_id));
  for (const s of F.SAVES) {
    if (s.status !== "ready" || s.states.archived_at) continue;
    for (const t of s.insights?.tags ?? []) add("tag", t.trim().toLowerCase(), s);
    if (s.creator_handle) add("creator", s.creator_handle.toLowerCase(), s);
    if (s.insights?.intent) add("intent", s.insights.intent, s);
    if (withPlace.has(s.id)) add("places", "places", s);
  }
  return [...groups.values()]
    .filter((g) => g.rows.length >= (g.kind === "places" ? 1 : 3))
    .map((g) => {
      const rows = [...g.rows].sort((a, b) => b.saved_at.localeCompare(a.saved_at));
      return { kind: g.kind, key: g.key, label: g.kind === "creator" ? `@${g.key.replace(/^@/, "")}` : g.kind === "places" ? "Places" : g.key, n: rows.length, save_ids: rows.map((r) => r.id), latest: rows[0].saved_at };
    })
    .sort((a, b) => b.n - a.n || b.latest.localeCompare(a.latest));
}

function rpc(name, body) {
  const empty = mode === "empty";
  switch (name) {
    case "auto_collections": return empty ? [] : autoCollections();
    case "pipeline_status":
      if (empty) return { ...F.PIPELINE, ai: false, is_owner: false, owners_set: true, video_bytes: 0 };
      return mode === "nokey" ? { ...F.PIPELINE, ai: false } : F.PIPELINE;
    case "wrapped": return empty ? { saved: 0, watched: 0, applied: 0, kept: 0, recalled: 0, top_spaces: [], top_creators: [] } : { ...F.WRAPPED, month: body.p_month };
    case "related_saves": return empty ? [] : F.RELATED;
    case "search_saves": return empty ? [] : F.SAVES.slice(0, 4).map((s, i) => ({ save_id: s.id, snippet: F.TRANSCRIPT.segments[i % 5].text, snippet_start: F.TRANSCRIPT.segments[i % 5].start, score: 1 - i / 10 }));
    case "get_collection": return F.COLLECTION;
    case "vapid_public_key": return null;
    default: return null;
  }
}

// A fixture "video frame": a soft, colourful abstract composition per save (hue in the path's ?h=).
function frame(hue) {
  const h2 = (hue + 40) % 360;
  const h3 = (hue + 200) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 640" width="360" height="640">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="hsl(${hue} 55% 62%)"/><stop offset="1" stop-color="hsl(${h2} 50% 28%)"/></linearGradient>
<radialGradient id="r" cx="0.5" cy="0.45" r="0.5"><stop offset="0" stop-color="hsl(${h3} 70% 80%)" stop-opacity="0.9"/><stop offset="1" stop-color="hsl(${h3} 70% 80%)" stop-opacity="0"/></radialGradient>
</defs>
<rect width="360" height="640" fill="url(#g)"/>
<circle cx="230" cy="250" r="190" fill="url(#r)"/>
<ellipse cx="180" cy="300" rx="78" ry="96" fill="hsl(${hue} 30% 18%)" opacity="0.55"/>
<circle cx="180" cy="190" r="46" fill="hsl(${hue} 30% 18%)" opacity="0.55"/>
<rect x="0" y="470" width="360" height="170" fill="hsl(${h2} 40% 14%)" opacity="0.35"/>
</svg>`;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS",
    "Access-Control-Expose-Headers": "Content-Range",
    "Content-Type": "application/json",
    ...headers,
  });
  res.end(body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  let body = {};
  try {
    body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
  } catch {
    body = {};
  }
  if (req.method === "OPTIONS") return send(res, 204);
  const p = url.pathname;

  if (p === "/__mode") {
    if (req.method === "POST" && body.mode) {
      mode = body.mode;
      asked = [];
      highlighted = [];
    }
    return send(res, 200, { mode });
  }

  // Edge Functions
  if (p === "/functions/v1/stash-embed") {
    // 384 numbers, unit length (the direction means nothing here).
    const one = Array.from({ length: 384 }, (_, i) => (i === 0 ? 1 : 0));
    const n = Array.isArray(body.input) ? body.input.length : 1;
    return send(res, 200, { embeddings: Array.from({ length: n }, () => one), model: "gte-small", dims: 384 });
  }
  if (p === "/functions/v1/stash-recovery") {
    // create answers with the code and a fresh session (making the code ends the old one)
    if (body.action === "create") return send(res, 200, { code: F.RECOVERY_CODE, created_at: new Date().toISOString(), access_token: TOKEN, refresh_token: "fixture-refresh", expires_at: 4102444800 });
    if (body.action === "restore") {
      const code = String(body.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (code.length !== 20) return send(res, 400, { error: "invalid_code" });
      if (code.startsWith("00000")) return send(res, 404, { error: "not_found" });
      if (code.startsWith("99999")) return send(res, 429, { error: "rate_limited" });
      return send(res, 200, { access_token: TOKEN, refresh_token: "fixture-refresh", expires_at: 4102444800, user_id: F.USER_ID });
    }
    return send(res, 400, { error: "bad_request" });
  }

  // Auth
  if (p.startsWith("/auth/v1/")) {
    if (p.endsWith("/user")) return send(res, 200, USER);
    if (p.endsWith("/signup") || p.endsWith("/token")) return send(res, 200, SESSION);
    if (p.endsWith("/user") && req.method === "GET") return send(res, 200, USER);
    if (p.endsWith("/logout")) return send(res, 204);
    return send(res, 200, {});
  }

  // Storage: signing and the signed "files"
  if (p.startsWith("/storage/v1/object/sign/")) {
    if (req.method === "POST") {
      const bucket = p.split("/")[5];
      const paths = body.paths ?? [];
      if (paths.length) return send(res, 200, paths.map((path) => ({ path, signedURL: `/object/sign/${bucket}/${encodeURIComponent(path)}?token=fixture`, error: null })));
      return send(res, 200, { signedURL: `/object/sign/${bucket}/x?token=fixture` });
    }
    // storage-js runs encodeURI over the signed URL, so the path arrives encoded twice.
    const raw = decodeURIComponent(decodeURIComponent(p.split("/").slice(6).join("/")));
    if (p.split("/")[5] === "stash-video") {
      if (!VIDEO) return send(res, 404, { message: "no fixture video" });
      res.writeHead(200, { "Access-Control-Allow-Origin": "*", "Content-Type": "video/webm", "Content-Length": VIDEO.length, "Accept-Ranges": "none", "Cache-Control": "max-age=3600" });
      return res.end(VIDEO);
    }
    if (p.split("/")[5] === "stash-exports") return send(res, 200, { version: 1, tables: {} }, { "Content-Disposition": "attachment" });
    const hue = Number(/[?&]h=(\d+)/.exec(raw)?.[1] ?? 200);
    return send(res, 200, frame(hue), { "Content-Type": "image/svg+xml", "Cache-Control": "max-age=3600" });
  }
  if (p.startsWith("/storage/v1/")) return send(res, 200, { Key: "fixture" });

  // REST
  if (p.startsWith("/rest/v1/rpc/")) return send(res, 200, rpc(p.split("/").pop(), body));
  if (p.startsWith("/rest/v1/")) {
    const table = p.split("/")[3];
    if (req.method !== "GET" && req.method !== "HEAD") {
      const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      const stamp = new Date().toISOString();
      if (table === "asks" && req.method === "POST") {
        // The daily limit is a trigger that raises SQLSTATE 54000.
        if (mode === "limit") return send(res, 400, { code: "54000", message: "ask limit reached", details: null, hint: null });
        const row = { id: `ask-new-${asked.length + 1}`, user_id: F.USER_ID, question: body.question, status: "queued", answer: null, cited_save_ids: [], error: null, created_at: stamp, updated_at: stamp, polls: 0 };
        asked.unshift(row);
        return send(res, 201, single ? row : [row]);
      }
      if (table === "highlights" && req.method === "POST") {
        const row = { id: `hl-new-${highlighted.length + 1}`, user_id: F.USER_ID, card_id: null, source: "user", start_s: null, end_s: null, created_at: stamp, ...body };
        highlighted.unshift(row);
        return send(res, 201, single ? row : [row]);
      }
      const rows = Array.isArray(body) ? body : [{ id: `new-${Date.now()}`, ...body }];
      return send(res, req.method === "POST" ? 201 : 200, single ? rows[0] : rows);
    }
    // The "worker": a question is picked up on the first poll and answered on the second.
    if (table === "asks") {
      for (const a of asked) {
        if (a.status === "ready" || a.status === "failed" || !(url.searchParams.get("id") ?? "").includes(a.id)) continue;
        a.polls += 1;
        if (a.polls === 1) a.status = "running";
        else if (mode === "nokey") Object.assign(a, { status: "failed", error: "no_ai" });
        else Object.assign(a, { status: "ready", ...F.ASK_ANSWER });
      }
    }
    let rows;
    if (table === "daily_queues") {
      const day = /eq\.(.+)/.exec(url.searchParams.get("day") ?? "")?.[1];
      rows = mode === "empty" || !day ? [] : [F.dailyQueue(day)];
    } else {
      rows = query(tables()[table] ?? [], url.searchParams);
    }
    const range = { "Content-Range": `0-${Math.max(0, rows.length - 1)}/${rows.length}` };
    if (req.method === "HEAD") return send(res, 200, undefined, range);
    if ((req.headers.accept ?? "").includes("vnd.pgrst.object")) {
      if (!rows.length) return send(res, 406, { code: "PGRST116", message: "no rows", details: "", hint: null });
      return send(res, 200, rows[0], range);
    }
    return send(res, 200, rows, range);
  }

  send(res, 404, { message: "not mocked" });
});

server.listen(PORT, "127.0.0.1", () => console.log(`mock supabase on http://127.0.0.1:${PORT}`));
