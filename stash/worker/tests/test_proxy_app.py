"""The proxy client, the HTTP entry point, and the document colours against styles/tokens.css."""

from __future__ import annotations

import logging
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from stash_worker import app as app_module
from stash_worker import render
from stash_worker.proxy import Proxy, ProxyError, Unauthorized, vector_literal

from fakes import FakeHttp, Resp

TOKEN = "t" * 64
BASE = "https://x.supabase.co/functions/v1/stash-worker-proxy"


def proxy(replies, plain=None):
    http = FakeHttp(replies)
    return Proxy("https://x.supabase.co/", TOKEN, http=http, plain=plain or FakeHttp([]), sleep=lambda s: None), http


def test_rest_calls_go_through_the_proxy_routes():
    p, http = proxy([Resp(200, [{"id": 1}]), Resp(201), Resp(204), Resp(204), Resp(200, [{"id": "j"}])])
    assert p.select("saves", {"select": "id", "id": "eq.1"}) == [{"id": 1}]
    p.insert("embeddings", {"save_id": "s"}, upsert_on="save_id")
    p.update("saves", {"id": "eq.1"}, {"status": "ready"})
    p.delete("places", {"save_id": "eq.1"})
    assert p.rpc("claim_jobs", {"p_limit": 1}) == [{"id": "j"}]
    get, post, patch, delete, rpc = http.requests
    assert (get["method"], get["url"], get["params"]) == ("GET", f"{BASE}/rest/saves", {"select": "id", "id": "eq.1"})
    assert post["url"] == f"{BASE}/rest/embeddings" and post["params"] == {"on_conflict": "save_id"}
    assert post["headers"]["Prefer"] == "return=minimal,resolution=merge-duplicates"
    assert (patch["method"], patch["params"], patch["json"]) == ("PATCH", {"id": "eq.1"}, {"status": "ready"})
    assert delete["method"] == "DELETE" and rpc["url"] == f"{BASE}/rest/rpc/claim_jobs"


def test_large_inserts_are_split_so_no_body_nears_the_proxys_limit():
    p, http = proxy([Resp(201), Resp(201), Resp(201)])
    p.insert("galaxy_points", [{"save_id": str(i)} for i in range(1200)])
    assert [len(r["json"]) for r in http.requests] == [500, 500, 200]


def test_files_go_straight_to_storage_with_a_signed_url_and_never_carry_the_token(tmp_path):
    plain = FakeHttp([Resp(200), Resp(200, content=b"bytes")])
    p, http = proxy([Resp(200, {"url": "https://x.supabase.co/storage/v1/object/upload/sign/stash-video/u/s.mp4?token=abc",
                                "token": "abc", "path": "u/s.mp4"}),
                     Resp(200, {"url": "https://x.supabase.co/storage/v1/object/sign/stash-video/u/s.mp4?token=def"})], plain)
    clip = tmp_path / "v.mp4"
    clip.write_bytes(b"0123456789")
    assert p.upload("stash-video", "u/s.mp4", clip, "video/mp4") == 10
    assert http.requests[0]["url"] == f"{BASE}/storage/sign-upload" and http.requests[0]["json"] == {"bucket": "stash-video", "path": "u/s.mp4"}
    put = plain.requests[0]
    assert put["method"] == "PUT" and "token=abc" in put["url"]
    assert put["headers"] == {"Content-Type": "video/mp4", "x-upsert": "true", "Cache-Control": "max-age=31536000",
                              "Content-Length": "10"}
    assert TOKEN not in str(put)
    assert p.download("stash-video", "u/s.mp4") == b"bytes"
    assert http.requests[1]["json"] == {"bucket": "stash-video", "path": "u/s.mp4", "expires_in": 600}


def test_embed_checks_the_shape():
    p, http = proxy([Resp(200, {"embeddings": [[0.1] * 384], "model": "gte-small", "dims": 384}),
                     Resp(200, {"embeddings": [[0.1] * 3]})])
    assert len(p.embed(["x" * 5000])[0]) == 384 and len(http.requests[0]["json"]["input"][0]) == 2000
    with pytest.raises(ProxyError):
        p.embed(["x"])
    assert vector_literal([0.5, -1]) == "[0.500000,-1.000000]"


def test_errors_retries_and_the_token_never_in_a_message():
    p, http = proxy([Resp(503), Resp(200, [])])
    assert p.select("saves", {}) == [] and len(http.requests) == 2        # a gateway hiccup is retried
    p, http = proxy([Resp(503)])
    with pytest.raises(ProxyError):
        p.insert("usage", [{"kind": "embed"}])                            # a plain insert is not (it could land twice)
    assert len(http.requests) == 1
    p, _ = proxy([Resp(401)])
    with pytest.raises(Unauthorized) as e:
        p.config()
    assert TOKEN not in str(e.value)
    p, _ = proxy([Resp(403)])
    with pytest.raises(ProxyError) as e:
        p.select("config", {})
    assert e.value.status == 403 and str(e.value) == "GET /rest/config -> 403"


# --- /run and /health ---------------------------------------------------------------------

@pytest.fixture()
def client():
    return TestClient(app_module.app)


def test_health_works_with_nothing_configured_and_tells_no_secret(client, monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    assert client.get("/").json() == {"ok": True, "supabase_url_set": False}
    h = client.get("/health").json()
    assert h["ok"] is True and h["supabase_url_set"] is False and set(h) == {"ok", "supabase_url_set", "python", "yt_dlp"}
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co")
    assert client.get("/").json() == {"ok": True, "supabase_url_set": True}


def test_run_needs_a_token_and_a_url(client, monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    assert client.post("/run").status_code == 401
    assert client.post("/run", headers={"x-stash-worker-token": "short"}).status_code == 401
    assert client.post("/run", headers={"x-stash-worker-token": TOKEN}).status_code == 503


def test_run_passes_the_token_to_the_proxy_and_never_logs_it(client, monkeypatch, caplog):
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co")
    made = {}

    class FakeProxy:
        def __init__(self, url, token):
            made.update(url=url, token=token)

        def config(self):
            if made.get("refuse"):
                raise Unauthorized("POST /config", 401)
            return {"owner_ids": ["u1"], "keys": {"gemini": "SECRET-KEY"}, "config": {"gemini_fast_model": "g"}}

        def close(self):
            made["closed"] = True

    monkeypatch.setattr(app_module, "Proxy", FakeProxy)
    monkeypatch.setattr(app_module, "run", lambda proxy, cfg: made.update(cfg=cfg) or {"done": 2, "failed": 0, "requeued": 0, "trashed": 1})
    with caplog.at_level(logging.DEBUG):
        r = client.post("/run", headers={"x-stash-worker-token": TOKEN}, json={})
    assert r.status_code == 200 and r.json() == {"done": 2, "failed": 0, "requeued": 0, "trashed": 1}
    assert made["token"] == TOKEN and made["url"] == "https://x.supabase.co" and made["closed"]
    assert made["cfg"].ai_provider == "gemini" and made["cfg"].owner_user_ids == frozenset({"u1"})
    assert TOKEN not in caplog.text and "SECRET-KEY" not in caplog.text and TOKEN not in r.text
    made["refuse"] = True
    assert client.post("/run", headers={"x-stash-worker-token": TOKEN}).status_code == 401  # the proxy said no


# --- Brand colours ---------------------------------------------------------------------------

def light_tokens() -> dict[str, str]:
    css = (Path(__file__).resolve().parents[2] / "styles/tokens.css").read_text()
    block = css[css.index('[data-theme="light"] {'):]
    block = block[:block.index("}")]
    return {name: value.upper() for name, value in re.findall(r"(--[\w-]+):\s*#([0-9a-fA-F]{6})\b", block)}


def test_document_colours_are_the_apps_light_theme_tokens():
    tokens = light_tokens()
    assert len(tokens) > 15
    for const, token in render.TOKEN_NAMES.items():
        value = render.SPACE_HEX[const.split(".")[1]] if const.startswith("SPACE_HEX.") else getattr(render, const)
        assert value == tokens[token], f"render.{const} drifted from {token} in styles/tokens.css"
    assert set(render.SPACE_HEX) == {t.removeprefix("--space-") for t in tokens if t.startswith("--space-")}
