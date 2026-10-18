"""The job flow end to end against an in-memory database, with network steps stubbed."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from stash_worker import ai, media, pipeline
from stash_worker.config import Config

OWNER = "u-owner"


class FakeSupa:
    def __init__(self):
        self.tables: dict[str, list[dict[str, Any]]] = {
            "saves": [], "jobs": [], "spaces": [], "settings": [], "usage": [], "insights": [],
            "transcripts": [], "places": [], "cards": [], "embeddings": [], "media_trash": [],
        }
        self.uploads: list[str] = []
        self.files: dict[str, int] = {}  # "<bucket>/<path>" -> size in bytes

    @staticmethod
    def _match(row, params):
        for k, v in params.items():
            if k in ("select", "limit", "order", "on_conflict"):
                continue
            op, _, val = v.partition(".")
            if op == "eq" and str(row.get(k)).lower() != val.lower():
                return False
            if op == "gte" and str(row.get(k, "")) < val:
                return False
            if op == "in" and str(row.get(k)) not in val.strip("()").split(","):
                return False
            if op == "is" and val == "null" and row.get(k) is not None:
                return False
            if op == "not" and val == "is.null" and row.get(k) is None:
                return False
        return True

    def select(self, table, params):
        return [dict(r) for r in self.tables[table] if self._match(r, params)]

    def one(self, table, params):
        rows = self.select(table, params)
        return rows[0] if rows else None

    def insert(self, table, rows, upsert_on=None):
        if isinstance(rows, list) and len({tuple(sorted(r)) for r in rows}) > 1:
            raise ValueError("All object keys must match")  # PostgREST's rule for bulk inserts
        for row in rows if isinstance(rows, list) else [rows]:
            if upsert_on:
                self.tables[table] = [r for r in self.tables[table] if r.get(upsert_on) != row.get(upsert_on)]
            self.tables[table].append(dict(row))

    def update(self, table, match, values):
        for r in self.tables[table]:
            if self._match(r, match):
                r.update(values)

    def delete(self, table, match):
        self.tables[table] = [r for r in self.tables[table] if not self._match(r, match)]

    def upload(self, bucket, path, data, content_type):
        self.uploads.append(f"{bucket}/{path}")
        self.files[f"{bucket}/{path}"] = len(data)

    def remove(self, bucket, paths):
        for p in paths:
            self.files.pop(f"{bucket}/{p}", None)

    def list_files(self, bucket, folder):
        pre = f"{bucket}/{folder.rstrip('/')}/"
        return [{"id": k, "name": k[len(pre):], "metadata": {"size": v}}
                for k, v in self.files.items() if k.startswith(pre)]

    def rpc(self, fn, args):
        return []


def cfg(**over) -> Config:
    base = dict(
        supabase_url="https://x", service_key="k", owner_user_ids=frozenset({OWNER}),
        groq_key="g", groq_insights_model="m", voyage_key="v",
    )
    base.update(over)
    return Config(**base)


@pytest.fixture()
def db():
    d = FakeSupa()
    d.tables["spaces"] = [
        {"id": "inbox", "name": "Inbox", "kind": "inbox", "user_id": OWNER, "archived": False},
        {"id": "mkt", "name": "Marketing", "kind": "topic", "user_id": OWNER, "archived": False},
    ]
    d.tables["settings"] = [{"user_id": OWNER, "monthly_budget_usd": 5}]
    d.tables["saves"] = [{"id": "s1", "user_id": OWNER, "source_url": "https://www.instagram.com/reel/x/",
                          "platform": "instagram", "space_id": None, "status": "queued"}]
    return d


JOB = {"id": "j1", "type": "ingest", "save_id": "s1", "attempts": 1}


def stub_network(monkeypatch, tmp_path, *, download=None):
    def fake_download(url, workdir, max_s, cookies=""):
        if download:
            raise download
        video = Path(workdir) / "source.mp4"
        video.write_bytes(b"v")
        return media.Fetched(video, "caption about pricing", "Pricing", "creator", 30.0, None)

    monkeypatch.setattr(media, "download", fake_download)
    monkeypatch.setattr(media, "page_metadata",
                        lambda url: media.Fetched(None, "og caption", "OG title", None, None, None))
    monkeypatch.setattr(media, "probe", lambda p: {"duration": 30.0, "has_audio": True, "has_video": True})
    monkeypatch.setattr(media, "thumbnail", lambda src, dst, at_seconds=1.0: Path(dst).write_bytes(b"j"))
    monkeypatch.setattr(media, "transcode", lambda src, dst: Path(dst).write_bytes(b"m"))
    monkeypatch.setattr(media, "audio_for_transcription", lambda src, dst: Path(dst).write_bytes(b"a"))
    monkeypatch.setattr(ai, "transcribe", lambda c, audio: ai.Transcript(
        [{"start": 0.0, "end": 2.0, "text": "use a decoy tier"}], "use a decoy tier", "en", 30.0))
    monkeypatch.setattr(ai, "understand", lambda c, **kw: ai.Understanding({
        "title": "Decoy", "key_idea": "Use a decoy tier.", "takeaways": ["a", "b", "c"], "actions": [],
        "intent": "learn", "tags": ["pricing"], "language": "en", "suggested_space_id": "mkt",
        "confidence": 0.9, "places": [{"name": "Café", "address": None}],
        "cards": [{"prompt": "q", "answer": "a"}]}, 1000, 200, 0.002))
    monkeypatch.setattr(ai, "embed", lambda c, text, input_type="document": ai.Embedding([0.1] * 1024, 50))


def test_full_ingest_files_into_suggested_space(db, monkeypatch, tmp_path):
    stub_network(monkeypatch, tmp_path)
    db.tables["jobs"] = [dict(JOB, state="running")]
    assert pipeline.process_job(db, cfg(), JOB) == "ready"
    save = db.tables["saves"][0]
    assert save["status"] == "ready" and save["error"] is None
    assert save["space_id"] == "mkt"
    assert save["video_path"] == f"{OWNER}/s1.mp4"
    assert f"stash-videos/{OWNER}/s1.mp4" in db.files
    assert save["thumb_path"] == f"{OWNER}/s1.jpg"
    assert db.tables["insights"][0]["key_idea"] == "Use a decoy tier."
    assert db.tables["transcripts"][0]["full_text"] == "use a decoy tier"
    assert len(db.tables["embeddings"]) == 1 and len(db.tables["cards"]) == 1 and len(db.tables["places"]) == 1
    assert {u["kind"] for u in db.tables["usage"]} == {"transcribe", "understand", "embed"}
    assert db.tables["jobs"][0]["state"] == "done"


def test_download_failure_falls_back_to_page_metadata(db, monkeypatch, tmp_path):
    stub_network(monkeypatch, tmp_path, download=media.DownloadFailed("login"))
    assert pipeline.process_job(db, cfg(), JOB) == "ready"
    save = db.tables["saves"][0]
    assert save["status"] == "ready"
    assert save["caption"] == "og caption"
    assert save.get("video_path") is None
    assert "original" in save["error"]


def test_dead_link(db, monkeypatch, tmp_path):
    stub_network(monkeypatch, tmp_path, download=media.DeadLink("gone"))
    assert pipeline.process_job(db, cfg(), JOB) == "dead_link"
    assert db.tables["saves"][0]["status"] == "dead_link"


def test_stranger_is_not_processed(db, monkeypatch, tmp_path):
    stub_network(monkeypatch, tmp_path)
    assert pipeline.process_job(db, cfg(owner_user_ids=frozenset({"someone-else"})), JOB) == "not_owner"
    assert db.tables["saves"][0]["status"] == "queued"
    assert not db.tables["insights"]


def test_budget_reached_waits_for_next_month(db, monkeypatch, tmp_path):
    stub_network(monkeypatch, tmp_path)
    db.tables["usage"] = [{"user_id": OWNER, "usd": 6, "created_at": "9999-01-01T00:00:00+00:00"}]
    db.tables["jobs"] = [dict(JOB, state="running")]
    assert pipeline.process_job(db, cfg(), JOB) == "budget"
    assert db.tables["jobs"][0]["state"] == "failed"
    assert db.tables["saves"][0]["status"] == "failed"
    assert "budget" in db.tables["saves"][0]["error"].lower()


def test_without_ai_or_storage_the_save_is_still_ready(db, monkeypatch, tmp_path):
    stub_network(monkeypatch, tmp_path)
    c = cfg(groq_insights_model="", anthropic_key="", video_quota_mb=0)
    assert pipeline.process_job(db, c, JOB) == "ready"
    save = db.tables["saves"][0]
    assert save["status"] == "ready" and save.get("video_path") is None
    assert save["error"]  # explains why there's no video / summary
    assert not db.tables["insights"]


def test_unexpected_error_retries_then_fails(db, monkeypatch, tmp_path):
    stub_network(monkeypatch, tmp_path)
    monkeypatch.setattr(ai, "understand", lambda c, **kw: (_ for _ in ()).throw(RuntimeError("boom")))
    db.tables["jobs"] = [dict(JOB, state="running")]
    assert pipeline.process_job(db, cfg(), JOB) == "retry"
    assert db.tables["jobs"][0]["state"] == "queued"
    assert pipeline.process_job(db, cfg(), dict(JOB, attempts=3)) == "failed"
    assert db.tables["saves"][0]["status"] == "failed"


def test_a_space_picked_during_processing_is_kept(db, monkeypatch, tmp_path):
    stub_network(monkeypatch, tmp_path)
    real_understand = ai.understand

    def pick_then_understand(c, **kw):
        db.tables["saves"][0]["space_id"] = "food"  # the owner taps a Space mid-job
        return real_understand(c, **kw)

    monkeypatch.setattr(ai, "understand", pick_then_understand)
    assert pipeline.process_job(db, cfg(), JOB) == "ready"
    assert db.tables["saves"][0]["space_id"] == "food"


def test_free_tier_limit_requeues_without_spending_an_attempt(db, monkeypatch, tmp_path):
    stub_network(monkeypatch, tmp_path)
    monkeypatch.setattr(ai, "understand", lambda c, **kw: (_ for _ in ()).throw(ai.RateLimited("60")))
    db.tables["jobs"] = [dict(JOB, state="running", attempts=1)]
    assert pipeline.process_job(db, cfg(), dict(JOB, attempts=1)) == "rate_limited"
    job = db.tables["jobs"][0]
    assert job["state"] == "queued" and job["attempts"] == 0 and job["run_after"]
    assert db.tables["saves"][0]["status"] == "queued"


def test_embedding_failure_does_not_fail_the_save(db, monkeypatch, tmp_path):
    stub_network(monkeypatch, tmp_path)
    monkeypatch.setattr(ai, "embed", lambda c, text, input_type="document": (_ for _ in ()).throw(RuntimeError("403")))
    assert pipeline.process_job(db, cfg(), JOB) == "ready"
    assert db.tables["saves"][0]["status"] == "ready"
    assert not db.tables["embeddings"]


def test_too_big_video_is_not_stored(db, monkeypatch, tmp_path):
    stub_network(monkeypatch, tmp_path)
    monkeypatch.setattr(media, "transcode", lambda src, dst: Path(dst).write_bytes(b"m" * 2_000_000))
    assert pipeline.process_job(db, cfg(video_max_mb=1), JOB) == "ready"
    save = db.tables["saves"][0]
    assert save.get("video_path") is None and "original" in save["error"]


def test_quota_clears_archived_then_watched_videos_first(db):
    mb = 1_048_576
    db.tables["saves"] = [
        {"id": "kept", "user_id": OWNER, "video_path": f"{OWNER}/kept.mp4", "saved_at": "2026-01-01",
         "states": {"kept": True, "archived_at": "x", "watched_at": "x"}},
        {"id": "unwatched", "user_id": OWNER, "video_path": f"{OWNER}/unwatched.mp4", "saved_at": "2026-01-02",
         "states": {"kept": False, "archived_at": None, "watched_at": None}},
        {"id": "watched", "user_id": OWNER, "video_path": f"{OWNER}/watched.mp4", "saved_at": "2026-01-03",
         "states": {"kept": False, "archived_at": None, "watched_at": "x"}},
        {"id": "archived", "user_id": OWNER, "video_path": f"{OWNER}/archived.mp4", "saved_at": "2026-01-04",
         "states": {"kept": False, "archived_at": "x", "watched_at": "x"}},
        {"id": "new", "user_id": OWNER, "video_path": f"{OWNER}/new.mp4", "saved_at": "2026-01-05",
         "states": {"kept": False, "archived_at": None, "watched_at": None}},
    ]
    for r in db.tables["saves"]:
        db.files[f"stash-videos/{r['video_path']}"] = 10 * mb
    cleared = pipeline.enforce_video_quota(db, cfg(video_quota_mb=31), OWNER, keep="new")
    assert cleared == 2
    left = {r["id"] for r in db.tables["saves"] if r["video_path"]}
    assert left == {"kept", "unwatched", "new"}
    assert f"stash-videos/{OWNER}/archived.mp4" not in db.files


def test_groq_tool_call_is_parsed(monkeypatch):
    import json

    import httpx

    args = {"title": "Decoy pricing", "key_idea": "Add a decoy tier to lift the middle plan.",
            "takeaways": ["a", "b", "c"], "actions": [], "intent": "learn", "tags": ["pricing"],
            "language": "en", "suggested_space": "Marketing", "confidence": 0.9, "cards": [{"prompt": "q", "answer": "a"}]}
    seen = {}

    def fake_post(url, headers=None, json=None, timeout=None, **kw):
        seen["body"] = json
        return httpx.Response(200, request=httpx.Request("POST", url), content=__import__("json").dumps({
            "choices": [{"message": {"tool_calls": [{"function": {"name": "save_insights",
                                                                   "arguments": __import__("json").dumps(args)}}]}}],
            "usage": {"prompt_tokens": 900, "completion_tokens": 300}}).encode())

    monkeypatch.setattr(httpx, "post", fake_post)
    u = ai.understand(cfg(), platform="instagram", creator=None, title=None, caption="c", transcript="t",
                      space_names={"marketing": "mkt"}, user_note=None)
    assert u.insights["key_idea"].startswith("Add a decoy")
    assert u.insights["suggested_space_id"] == "mkt"
    assert u.usd == 0 and u.input_tokens == 900
    assert seen["body"]["model"] == "m" and seen["body"]["tool_choice"]["function"]["name"] == "save_insights"
    assert json.dumps(seen["body"])  # the request is plain JSON


def test_groq_429_raises_rate_limited(monkeypatch):
    import httpx

    monkeypatch.setattr(httpx, "post", lambda url, **kw: httpx.Response(429, request=httpx.Request("POST", url),
                                                                       headers={"retry-after": "30"}))
    with pytest.raises(ai.RateLimited):
        ai.understand(cfg(), platform="tiktok", creator=None, title=None, caption="c", transcript=None,
                      space_names={}, user_note=None)
