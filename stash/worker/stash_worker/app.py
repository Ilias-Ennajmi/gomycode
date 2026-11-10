"""HTTP entry point (ASGI; runs as one Vercel Python function, 300 s).

GET  /, /health   liveness. Works with nothing configured; says only whether SUPABASE_URL is set.
POST /run         header `x-stash-worker-token`. Called by Postgres (pg_net) when a job is queued
                  and by the pg_cron sweep every minute. Processes the queue inside the request.

The worker holds no secret. The token arrives with the request, is shown to stash-worker-proxy,
and lives in local variables for this one call: never logged, never written to disk.
"""

from __future__ import annotations

import logging
import platform

from fastapi import FastAPI, Header, HTTPException

from .config import Config, supabase_url_from_env
from .pipeline import run
from .proxy import Proxy, ProxyError, Unauthorized

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)  # its INFO lines print full request URLs
app = FastAPI(title="Stash worker", docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware("http")
async def strip_function_prefix(request, call_next):
    """Vercel rewrites everything to /api/index; if the function ever sees that path, treat it as the root."""
    path = request.scope.get("path", "")
    if path == "/api/index" or path.startswith("/api/index/"):
        request.scope["path"] = path[len("/api/index"):] or "/"
    return await call_next(request)


@app.get("/")
def root() -> dict:
    return {"ok": True, "supabase_url_set": bool(supabase_url_from_env())}


@app.get("/health")
def health() -> dict:
    """What is configured, with no secret and no call to anything."""
    try:
        from yt_dlp.version import __version__ as ytdlp
    except Exception:  # noqa: BLE001
        ytdlp = None
    return {"ok": True, "supabase_url_set": bool(supabase_url_from_env()), "python": platform.python_version(),
            "yt_dlp": ytdlp}


@app.post("/run")
def run_queue(x_stash_worker_token: str = Header(default="")) -> dict:
    token = x_stash_worker_token.strip()
    if len(token) < 32:
        raise HTTPException(401, "unauthorized")
    url = supabase_url_from_env()
    if not url.startswith("https://") and not url.startswith("http://127.0.0.1"):
        raise HTTPException(503, "SUPABASE_URL is not set")
    proxy = Proxy(url, token)
    try:
        try:
            cfg = Config.from_worker_config(proxy.config(), url)
        except Unauthorized:
            raise HTTPException(401, "unauthorized") from None
        except (ProxyError, ValueError):
            raise HTTPException(502, "proxy unavailable") from None
        return run(proxy, cfg)
    finally:
        proxy.close()
