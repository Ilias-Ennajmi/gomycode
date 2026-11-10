"""A stand-in for Supabase, for the local smoke test only (never deployed).

It speaks the routes of the Edge Function `stash-worker-proxy` and backs them with a real local
Postgres that has every Stash migration applied, so the worker's calls meet the real schema:
constraints, triggers, `claim_jobs`, `worker_token_ok`, `worker_config`, `evict_videos`,
`ask_context`. Storage is a folder on disk behind "signed" URLs. Embeddings are a deterministic
bag-of-words vector of 384 numbers. It also plays a tiny Gemini (`/v1beta/...`) that answers
each structured call from its response schema, so the provider path runs over real HTTP.

The PostgREST translation covers what the worker sends (eq / in / is / gte filters, order,
limit, offset, `saves?select=…,insights(…),states(…)`, upserts, the three RPCs), not PostgREST.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from pathlib import Path
from typing import Any

import psycopg
from fastapi import FastAPI, HTTPException, Request, Response
from psycopg import sql
from psycopg.rows import dict_row

PREFIX = "/functions/v1/stash-worker-proxy"
TABLES = {"saves", "insights", "transcripts", "embeddings", "places", "states", "cards", "reviews", "syntheses",
          "reminders", "jobs", "exports", "usage", "settings", "spaces", "media_trash", "galaxy_points",
          "galaxy_clusters", "galaxy_layouts", "asks", "highlights", "backups", "daily_queues", "imports"}
RPCS = {"claim_jobs", "ask_context", "evict_videos"}
BUCKETS = {"stash-video", "stash-thumbs", "stash-exports", "stash-voice"}
PATH_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f-]{27}/[A-Za-z0-9._/-]{1,200}$")
RESERVED = {"select", "order", "limit", "offset", "on_conflict", "columns"}


def pseudo_embedding(text: str) -> list[float]:
    v = [0.0] * 384
    for word in re.findall(r"\w+", text.lower()):
        h = int.from_bytes(hashlib.sha256(word.encode()).digest()[:4], "big")
        v[h % 384] += 1.0
    norm = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / norm for x in v]


def make_app(dsn: str, storage: Path, public_url: str) -> FastAPI:
    app = FastAPI()
    app.state.log = []          # (method, route) of every proxy call, in order
    app.state.gemini_calls = []  # what "Gemini" was asked

    def db() -> psycopg.Connection:
        conn = psycopg.connect(dsn, row_factory=dict_row, autocommit=False)
        conn.execute("select set_config('request.jwt.claim.role', 'service_role', false)")
        return conn

    def check(req: Request) -> None:
        token = req.headers.get("x-stash-worker-token", "")
        with db() as conn:
            ok = conn.execute("select stash.worker_token_ok(%s) as ok", (token,)).fetchone()["ok"]
        if not ok:
            raise HTTPException(401, "unauthorized")

    def where(params: dict[str, str]) -> tuple[sql.Composable, list[Any]]:
        parts: list[sql.Composable] = []
        args: list[Any] = []
        for key, value in params.items():
            if key in RESERVED:
                continue
            op, _, val = value.partition(".")
            col = sql.Identifier(key)
            if op == "eq":
                parts.append(sql.SQL("{}::text = %s").format(col)); args.append(val)
            elif op == "gte":
                parts.append(sql.SQL("{} >= %s").format(col)); args.append(val)
            elif op == "in":
                parts.append(sql.SQL("{}::text = any(%s)").format(col)); args.append(val.strip("()").split(","))
            elif op == "is" and val == "null":
                parts.append(sql.SQL("{} is null").format(col))
            else:
                raise HTTPException(400, f"filter not supported by the smoke proxy: {key}={value}")
        return (sql.SQL(" where ") + sql.SQL(" and ").join(parts)) if parts else sql.SQL(""), args

    def fix_row(table: str, row: dict[str, Any]) -> dict[str, Any]:
        if table == "embeddings" and isinstance(row.get("vector"), str):
            row = {**row, "vector": json.loads(row["vector"])}  # the stub vector type is float8[]
        return row

    @app.api_route(PREFIX + "/rest/{target:path}", methods=["GET", "POST", "PATCH", "DELETE"])
    async def rest(target: str, req: Request) -> Response:
        check(req)
        app.state.log.append((req.method, f"/rest/{target}"))
        params = dict(req.query_params)
        body = json.loads(await req.body() or b"null")
        with db() as conn:
            if target.startswith("rpc/"):
                fn = target[4:]
                if fn not in RPCS or req.method != "POST":
                    raise HTTPException(403, "forbidden")
                if fn == "claim_jobs":
                    out = conn.execute("select coalesce(json_agg(j), '[]'::json) as r from stash.claim_jobs(%s) j",
                                       (body.get("p_limit", 1),)).fetchone()["r"]
                elif fn == "evict_videos":
                    out = conn.execute("select stash.evict_videos(%s) as r", (body.get("p_incoming_bytes", 0),)).fetchone()["r"]
                else:
                    emb = json.loads(body["p_embedding"]) if body.get("p_embedding") else None
                    out = conn.execute(
                        "select coalesce(json_agg(c), '[]'::json) as r from stash.ask_context(%s, %s, %s::float8[], %s) c",
                        (body["p_user_id"], body["p_query"], emb, body.get("p_limit", 8))).fetchone()["r"]
                conn.commit()
                return Response(json.dumps(out, default=str), media_type="application/json")
            if target not in TABLES:
                raise HTTPException(403, "forbidden")
            t = sql.Identifier("stash", target)
            if req.method == "GET":
                select = params.get("select", "*")
                embedded = re.findall(r"(\w+)\(([^)]*)\)", select)
                plain = re.sub(r",?\w+\([^)]*\)", "", select).strip(",") or "*"
                cols = sql.SQL("t.*") if plain == "*" else sql.SQL(", ").join(sql.Identifier("t", c) for c in plain.split(","))
                for name, _inner in embedded:  # saves → insights / states, joined on save_id
                    if name not in TABLES:
                        raise HTTPException(403, "forbidden")
                    cols += sql.SQL(", (select coalesce(json_agg(e), '[]'::json) from {} e where e.save_id = t.id) as {}").format(
                        sql.Identifier("stash", name), sql.Identifier(name))
                w, args = where(params)
                q = sql.SQL("select {} from {} t{}").format(cols, t, w)
                if "order" in params:
                    col, *mods = params["order"].split(".")
                    q += sql.SQL(" order by {} {}").format(sql.Identifier(col), sql.SQL(
                        ("desc" if "desc" in mods else "asc") + (" nulls last" if "nullslast" in mods else "")))
                if "limit" in params:
                    q += sql.SQL(" limit %s"); args.append(int(params["limit"]))
                if "offset" in params:
                    q += sql.SQL(" offset %s"); args.append(int(params["offset"]))
                rows = conn.execute(q, args).fetchall()
                for r in rows:
                    if target == "embeddings" and r.get("vector") is not None:
                        r["vector"] = "[" + ",".join(str(x) for x in r["vector"]) + "]"
                return Response(json.dumps(rows, default=str), media_type="application/json")
            if req.method == "POST":
                rows = [fix_row(target, r) for r in (body if isinstance(body, list) else [body])]
                keys = list(rows[0])
                if any(list(r) != keys for r in rows):
                    raise HTTPException(400, "All object keys must match")
                idents = sql.SQL(", ").join(map(sql.Identifier, keys))
                q = sql.SQL("insert into {} ({}) select {} from json_populate_recordset(null::{}, %s)").format(t, idents, idents, t)
                if params.get("on_conflict"):
                    conflict = params["on_conflict"].split(",")
                    updates = [k for k in keys if k not in conflict]
                    q += sql.SQL(" on conflict ({}) do update set {}").format(
                        sql.SQL(", ").join(map(sql.Identifier, conflict)),
                        sql.SQL(", ").join(sql.SQL("{} = excluded.{}").format(sql.Identifier(k), sql.Identifier(k)) for k in updates))
                conn.execute(q, (json.dumps(rows),))
                conn.commit()
                return Response(status_code=201)
            w, args = where(params)
            if not args and " where " not in w.as_string(conn):
                raise HTTPException(400, "filter_required")
            if req.method == "PATCH":
                keys = list(body)
                idents = sql.SQL(", ").join(map(sql.Identifier, keys))
                q = sql.SQL("update {} set ({}) = (select {} from json_populate_record(null::{}, %s)){}").format(t, idents, idents, t, w) \
                    if len(keys) > 1 else \
                    sql.SQL("update {} set {} = (select {} from json_populate_record(null::{}, %s)){}").format(t, idents, idents, t, w)
                conn.execute(q, [json.dumps(body), *args])
            else:
                conn.execute(sql.SQL("delete from {}{}").format(t, w), args)
            conn.commit()
            return Response(status_code=204)

    @app.post(PREFIX + "/config")
    async def config(req: Request) -> dict:
        check(req)
        app.state.log.append(("POST", "/config"))
        with db() as conn:
            cfg = conn.execute("select stash.worker_config() as c").fetchone()["c"]
        return {**cfg, "supabase_url": public_url, "anon_key": "anon"}

    def storage_ok(bucket: Any, path: Any) -> None:
        if bucket not in BUCKETS or not isinstance(path, str) or not PATH_RE.match(path) or ".." in path:
            raise HTTPException(403, "forbidden")

    @app.post(PREFIX + "/storage/{action}")
    async def storage_route(action: str, req: Request) -> dict:
        check(req)
        app.state.log.append(("POST", f"/storage/{action}"))
        body = await req.json()
        if action == "remove":
            removed = 0
            for p in body["paths"]:
                storage_ok(body["bucket"], p)
                f = storage / body["bucket"] / p
                if f.exists():
                    f.unlink()
                    removed += 1
            return {"removed": removed}
        storage_ok(body.get("bucket"), body.get("path"))
        kind = {"sign-upload": "upload", "sign-download": "download"}.get(action)
        if not kind:
            raise HTTPException(403, "forbidden")
        url = f"{public_url}/storage/v1/object/{kind}/sign/{body['bucket']}/{body['path']}?token=signed"
        return {"url": url, "token": "signed", "path": body["path"]} if kind == "upload" else {"url": url}

    @app.put("/storage/v1/object/upload/sign/{bucket}/{path:path}")
    async def put_object(bucket: str, path: str, req: Request, token: str = "") -> dict:
        if token != "signed" or req.headers.get("x-stash-worker-token"):
            raise HTTPException(400, "the signed upload must not carry the worker token")
        data = await req.body()
        limits = {"stash-video": (52428800, {"video/mp4"}), "stash-thumbs": (2097152, {"image/jpeg", "image/png", "image/webp"})}
        size, kinds = limits.get(bucket, (52428800, None))
        if len(data) > size or (kinds and req.headers.get("content-type") not in kinds):
            raise HTTPException(400, "bucket refused the file")
        f = storage / bucket / path
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(data)
        return {"Key": f"{bucket}/{path}"}

    @app.get("/storage/v1/object/download/sign/{bucket}/{path:path}")
    async def get_object(bucket: str, path: str) -> Response:
        f = storage / bucket / path
        if not f.exists():
            raise HTTPException(404, "not found")
        return Response(f.read_bytes())

    @app.post(PREFIX + "/embed")
    async def embed(req: Request) -> dict:
        check(req)
        app.state.log.append(("POST", "/embed"))
        inputs = (await req.json())["input"]
        return {"embeddings": [pseudo_embedding(t[:2000]) for t in inputs], "model": "gte-small", "dims": 384}

    # --- a tiny Gemini ------------------------------------------------------------------
    @app.post("/v1beta/models/{model}:generateContent")
    async def gemini(model: str, req: Request) -> dict:
        body = await req.json()
        if not req.headers.get("x-goog-api-key"):
            raise HTTPException(403, "no key")
        props = set(body["generationConfig"]["responseSchema"]["properties"])
        parts = body["contents"][0]["parts"]
        text = parts[-1]["text"]
        app.state.gemini_calls.append({"model": model, "kind": sorted(props)[:3],
                                       "media": [p["inline_data"]["mime_type"] for p in parts if "inline_data" in p]})
        if "segments" in props:
            answer = {"language": "en", "visual": "A person at a desk explains a pricing table.", "segments": [
                {"start": 0.0, "end": 3.2, "text": "Most people price by guessing."},
                {"start": 3.2, "end": 7.5, "text": "Add a decoy tier so the middle plan looks like the deal."}]}
        elif "key_idea" in props:
            answer = {"title": "Decoy pricing", "key_idea": "Add a decoy tier so the middle plan looks like the deal.",
                      "takeaways": ["Three tiers", "Decoy next to the target", "Test two weeks"], "actions": ["Add a decoy tier"],
                      "intent": "learn", "tags": ["pricing", "marketing"], "language": "en", "suggested_space": None,
                      "confidence": 0.3, "music_only": False, "places": [], "cards": [
                          {"prompt": "What does a decoy tier do?", "answer": "Makes the middle plan look like the deal."}],
                      "highlights": ["Add a decoy tier so the middle plan looks like the deal.", "A line nobody said."]}
        elif "answer" in props:
            answer = {"answer": "Add a decoy tier next to the plan you want to sell.", "cited": ["S1", "S42"]}
        elif "points" in props:
            answer = {"topic": "Pricing", "points": ["Use three tiers"], "disagreements": [], "suggested_action": "Add a decoy."}
        else:
            answer = {}
        return {"candidates": [{"content": {"parts": [{"text": json.dumps(answer)}]}, "finishReason": "STOP"}],
                "usageMetadata": {"promptTokenCount": len(text) // 4 + 258, "candidatesTokenCount": 120}}

    return app
