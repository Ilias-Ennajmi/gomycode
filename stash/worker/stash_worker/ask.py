"""`ask` jobs: one question about the owner's saves, answered from their saves only, with citations."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from . import ai
from .config import Config
from .proxy import ProxyError, vector_literal

log = logging.getLogger("stash.ask")

NOTHING = "Nothing in your saves about that yet."
CONTEXT_SAVES = 8


def process_ask(supa: Any, cfg: Config, job: dict[str, Any]) -> str:
    from .pipeline import _failed_usage, _finish_job, _gate, _log_usage, _refuse_mismatch, _usage, owner_mismatch

    ask_id = (job.get("payload") or {}).get("ask_id")
    row = supa.one("asks", {"select": "id,user_id,question,status", "id": f"eq.{ask_id}"}) if ask_id else None
    if not row:
        _finish_job(supa, job, "done", "ask gone")
        return "gone"
    user_id = row["user_id"]
    if owner_mismatch(job, user_id):  # the ask belongs to someone else: neither read nor answered
        return _refuse_mismatch(supa, job)
    match = {"id": f"eq.{row['id']}"}
    if row.get("status") in ("ready", "failed"):
        _finish_job(supa, job, "done")
        return "asked"

    def fail(error: str, outcome: str = "failed") -> str:
        supa.update("asks", match, {"status": "failed", "error": error})
        _finish_job(supa, job, "failed", error)
        return outcome

    supa.update("asks", match, {"status": "running", "error": None})
    question = str(row.get("question") or "").strip()[:500]

    embedding = None
    try:
        embedding = vector_literal(supa.embed([question])[0])
    except ProxyError as exc:  # words alone still find saves
        log.warning("question not embedded: %s", exc)
    context = supa.rpc("ask_context", {"p_user_id": user_id, "p_query": question, "p_embedding": embedding,
                                       "p_limit": CONTEXT_SAVES}) or []
    context = [c for c in context if isinstance(c, dict) and c.get("save_id")]
    if not context:
        supa.update("asks", match, {"status": "ready", "answer": NOTHING, "cited_save_ids": []})
        _finish_job(supa, job, "done")
        return "asked"

    refused = _gate(supa, cfg, user_id)
    if refused:
        return fail("not_owner" if refused == "not_owner" else "over_budget", refused)
    if not cfg.has_ai:
        return fail("no_ai", "ai_off")

    try:
        a = ai.ask(cfg, question=question, context=context)
    except (ai.InsightError, ai.ProviderError, ai.NoProvider) as exc:
        log.warning("ask failed: %s", exc)
        _log_usage(supa, _failed_usage(exc, user_id=user_id, kind="ask"))
        if getattr(exc, "retry_later", False) and int(job.get("attempts") or 1) < 3:
            # The provider is busy (429 / 503 / 529) or the run is nearly over: ask again in a minute or two.
            again = datetime.now(timezone.utc) + timedelta(minutes=int(job.get("attempts") or 1))
            supa.update("asks", match, {"status": "queued", "error": None})
            _finish_job(supa, job, "queued", "busy", run_after=again.isoformat())
            return "retry"
        return fail("ai_error")

    known = {str(c["save_id"]) for c in context}
    supa.update("asks", match, {"status": "ready", "answer": a.answer,
                                "cited_save_ids": [c for c in a.cited if c in known], "error": None})
    _log_usage(supa, [_usage(a, user_id=user_id, kind="ask")])
    _finish_job(supa, job, "done")
    return "asked"
