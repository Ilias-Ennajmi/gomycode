"""`backup` jobs: the owner's rows as one JSON file in stash-exports/<uid>/backups/, newest N kept."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from .config import Config
from .rules import is_owner

BUCKET = "stash-exports"
PAGE = 1000
# table -> column that gives a stable order for paging
TABLES = {
    "spaces": "id", "saves": "id", "insights": "save_id", "transcripts": "save_id", "places": "id",
    "states": "save_id", "cards": "id", "reviews": "id", "syntheses": "id", "reminders": "id",
    "highlights": "id", "asks": "id", "settings": "user_id",
}


def _all(supa: Any, table: str, user_id: str, order: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    while True:
        page = supa.select(table, {"select": "*", "user_id": f"eq.{user_id}", "order": order,
                                   "limit": str(PAGE), "offset": str(len(rows))})
        rows += page
        if len(page) < PAGE:
            return rows


def process_backup(supa: Any, cfg: Config, job: dict[str, Any]) -> str:
    from .pipeline import _finish_job

    user_id = job.get("user_id")
    if not user_id:
        _finish_job(supa, job, "failed", "no user")
        return "failed"
    if not is_owner(user_id, cfg.owner_user_ids):
        _finish_job(supa, job, "failed", "not_owner")
        return "not_owner"

    now = datetime.now(timezone.utc)
    tables = {}
    for name, order in TABLES.items():
        rows = _all(supa, name, user_id, order)
        if name == "transcripts":
            for r in rows:
                r.pop("tsv", None)  # generated column, rebuilt from full_text
        tables[name] = rows
    body = json.dumps({"version": 1, "created_at": now.isoformat(), "user_id": user_id, "tables": tables},
                      ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    path = f"{user_id}/backups/{now:%Y-%m-%d}.json"
    supa.upload(BUCKET, path, body, "application/json")
    supa.insert("backups", {"user_id": user_id, "path": path, "bytes": len(body), "saves": len(tables["saves"]),
                            "created_at": now.isoformat()}, upsert_on="user_id,path")

    # Keep the newest N; deleting a row queues its file for removal (database trigger).
    rows = supa.select("backups", {"select": "id,created_at", "user_id": f"eq.{user_id}",
                                   "order": "created_at.desc", "limit": "200"})
    rows.sort(key=lambda r: str(r.get("created_at") or ""), reverse=True)
    old = [str(r["id"]) for r in rows[cfg.backup_keep:]]
    if old:
        supa.delete("backups", {"user_id": f"eq.{user_id}", "id": f"in.({','.join(old)})"})
    supa.insert("usage", [{"user_id": user_id, "save_id": None, "kind": "backup", "provider": "supabase",
                           "input_tokens": 0, "output_tokens": 0, "audio_seconds": 0, "usd": 0}])
    _finish_job(supa, job, "done")
    return "backed_up"
