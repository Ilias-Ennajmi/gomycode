"""HTTP entry point for Cloud Run.

POST /run   (Authorization: Bearer $WORKER_SECRET) — called by Supabase pg_net when a
            job is queued, and by the pg_cron sweep every minute. Processes the queue
            inside the request, because Cloud Run only gives CPU while a request is open.
GET  /      health check; reports which features are configured (never their values).
"""

from __future__ import annotations

import hmac
import logging
import threading

from fastapi import FastAPI, Header, HTTPException

from .config import Config
from .pipeline import run
from .supa import Supa

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
app = FastAPI(title="Stash worker", docs_url=None, redoc_url=None, openapi_url=None)
_lock = threading.Lock()  # one queue run per instance at a time


@app.get("/")
def health() -> dict:
    cfg = Config()
    return {
        "ok": not cfg.missing_required(),
        "missing": cfg.missing_required(),
        "features": {
            "video_storage": cfg.has_r2,
            "ai": cfg.has_claude,
            "transcription": bool(cfg.groq_key),
            "search_by_meaning": bool(cfg.voyage_key),
            "owner_set": bool(cfg.owner_user_ids),
        },
    }


@app.post("/run")
def run_queue(authorization: str = Header(default="")) -> dict:
    cfg = Config()
    if cfg.missing_required():
        raise HTTPException(503, "worker not configured")
    expected = f"Bearer {cfg.worker_secret}"
    if not hmac.compare_digest(authorization.encode(), expected.encode()):
        raise HTTPException(401, "unauthorized")
    if not _lock.acquire(blocking=False):
        return {"busy": True}
    try:
        return run(Supa(cfg), cfg)
    finally:
        _lock.release()
