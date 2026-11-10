"""The ingest flow end to end against an in-memory database, with the network stubbed.

Covers the contract's rules: a save always ends ready, title and thumbnail land before the
download, the video columns change in one PATCH, eviction runs before the upload, the no-key
and not-owner paths, and `reprocess {"mode": "insights"}`."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from stash_worker import ai, geocode, media, pipeline
from stash_worker.config import Config
from stash_worker.proxy import ProxyError

OWNER = "u-owner"
SKIP = ("select", "limit", "order", "on_conflict", "offset")


class FakeSupa:
    """Stands in for the proxy client: tables in memory, and a log of every call in order."""

    def __init__(self):
        self.tables: dict[str, list[dict[str, Any]]] = {
            "saves": [], "jobs": [], "spaces": [], "settings": [], "usage": [], "insights": [],
            "transcripts": [], "places": [], "cards": [], "embeddings": [], "media_trash": [],
            "highlights": [],
        }
        self.uploads: list[str] = []
        self.files: dict[str, bytes] = {}
        self.calls: list[tuple] = []          # ("update", table, values) | ("rpc", fn, args) | ("upload", key) …
        self.fail_upload: set[str] = set()    # buckets whose upload raises

    @staticmethod
    def _match(row, params):
        for k, v in params.items():
            if k in SKIP:
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
        return True

    def select(self, table, params):
        rows = [dict(r) for r in self.tables[table] if self._match(r, params)]
        offset = int(params.get("offset", 0))
        return rows[offset:offset + int(params["limit"])] if "limit" in params else rows[offset:]

    def one(self, table, params):
        rows = self.select(table, params)
        return rows[0] if rows else None

    def insert(self, table, rows, upsert_on=None):
        if isinstance(rows, list) and len({tuple(sorted(r)) for r in rows}) > 1:
            raise ValueError("All object keys must match")  # PostgREST's rule for bulk inserts
        self.calls.append(("insert", table, rows))
        for row in rows if isinstance(rows, list) else [rows]:
            if upsert_on:
                keys = upsert_on.split(",")
                self.tables[table] = [r for r in self.tables[table] if any(r.get(k) != row.get(k) for k in keys)]
            self.tables[table].append(dict(row))

    def update(self, table, match, values):
        self.calls.append(("update", table, dict(values)))
        for r in self.tables[table]:
            if self._match(r, match):
                r.update(values)

    def delete(self, table, match):
        self.calls.append(("delete", table, dict(match)))
        self.tables[table] = [r for r in self.tables[table] if not self._match(r, match)]

    def upload(self, bucket, path, data, content_type):
        if bucket in self.fail_upload:
            raise ProxyError(f"PUT storage {bucket}", 500)
        self.calls.append(("upload", f"{bucket}/{path}", content_type))
        self.uploads.append(f"{bucket}/{path}")
        self.files[f"{bucket}/{path}"] = data.read_bytes() if isinstance(data, Path) else data
        return len(self.files[f"{bucket}/{path}"])

    def download(self, bucket, path, max_bytes=0):
        return self.files[f"{bucket}/{path}"]

    def remove(self, bucket, paths):
        self.calls.append(("remove", bucket, list(paths)))
        return len(paths)

    def rpc(self, fn, args):
        self.calls.append(("rpc", fn, dict(args)))
        return []

    def embed(self, texts):
        self.calls.append(("embed", len(texts)))
        return [[0.05] * 384 for _ in texts]

    def patches(self, table="saves"):
        return [c[2] for c in self.calls if c[0] == "update" and c[1] == table]


def cfg(**over) -> Config:
    """The run's settings as worker_config() would give them. Default: Claude reads, Groq transcribes."""
    over.pop("smart_model", None)  # smart falls back to fast now
    values = {"claude_fast_model": "m", "groq_transcribe_model": "w"}
    if over.pop("geocode", True) is False:
        values["geocode"] = "off"
    values.update(over.pop("values", {}))
    base = dict(supabase_url="https://x.supabase.co", owner_user_ids=frozenset({OWNER}),
                anthropic_key="a", groq_key="g", values=values)
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
    d.tables["saves"] = [{"id": "s1", "user_id": OWNER, "source_url": "https://www.tiktok.com/@a/video/7234567890123456789",
                          "platform": "tiktok", "space_id": None, "status": "queued", "process_step": "queued",
                          "video_state": "none", "playback": "link", "ai_state": "pending"}]
    return d


JOB = {"id": "j1", "type": "ingest", "save_id": "s1", "user_id": OWNER, "attempts": 1}
EMBED = "https://www.tiktok.com/player/v1/7234567890123456789"
INSIGHTS = {
    "title": "Decoy", "key_idea": "Use a decoy tier.", "takeaways": ["a", "b", "c"], "actions": [],
    "intent": "learn", "tags": ["pricing"], "language": "en", "suggested_space_id": "mkt",
    "confidence": 0.9, "places": [{"name": "Café", "address": None}],
    "cards": [{"prompt": "q", "answer": "a"}], "highlights": ["use a decoy tier", "never said this line"]}


def stub_network(monkeypatch, *, download=None, meta=None, events=None):
    events = events if events is not None else []

    def fake_metadata(url, platform=None):
        events.append("metadata")
        if isinstance(meta, Exception):
            raise meta
        return meta or media.Meta(title="Pricing trick", creator="@creator", caption="caption about pricing",
                                  thumb_url="https://cdn.example/t.jpg", embed_url=EMBED, found=True)

    def fake_download(url, workdir, *, max_seconds, max_bytes, cookies_b64=""):
        events.append("download")
        if download:
            raise download
        video = Path(workdir) / "video.mp4"
        video.write_bytes(b"\x00\x00\x00\x18ftypmp42" + b"v" * 2000)
        return media.Download(video, video.stat().st_size, {"duration": 30.0})

    monkeypatch.setattr(media, "metadata", fake_metadata)
    monkeypatch.setattr(media, "download", fake_download)
    monkeypatch.setattr(media, "fetch_image", lambda url: b"\xff\xd8\xffjpeg")
    monkeypatch.setattr(media, "to_jpeg", lambda data: data)
    monkeypatch.setattr(media, "youtube_captions", lambda url: None)
    monkeypatch.setattr(ai, "transcribe", lambda c, path, mime="video/mp4", seconds=0.0: ai.Transcript(
        [{"start": 0.0, "end": 2.0, "text": "use a decoy tier"}], "use a decoy tier", "en", 30.0, provider="groq"))
    monkeypatch.setattr(ai, "understand", lambda c, **kw: ai.Understanding(dict(INSIGHTS), 1000, 200, 0.002, "claude"))
    monkeypatch.setattr(geocode, "geocode_save", lambda supa, c, save_id, geocoder=None: 0)
    return events


def run(db, c=None, job=JOB):
    db.tables["jobs"] = [dict(job, state="running")]
    return pipeline.process_job(db, c or cfg(), job)


def test_full_ingest_stores_reads_and_files(db, monkeypatch):
    stub_network(monkeypatch)
    assert run(db) == "ready"
    save = db.tables["saves"][0]
    assert save["status"] == "ready" and save["process_step"] == "ready" and save["error"] is None
    assert save["ai_state"] == "done" and save["space_id"] == "mkt"
    assert save["video_path"] == f"{OWNER}/s1.mp4" and save["video_state"] == "stored" and save["playback"] == "video"
    assert save["video_bytes"] == len(db.files[f"stash-video/{OWNER}/s1.mp4"])
    assert save["thumb_path"] == f"{OWNER}/s1.jpg" and save["embed_url"] == EMBED
    assert save["title"] == "Pricing trick" and save["creator_handle"] == "@creator"
    assert db.tables["insights"][0]["key_idea"] == "Use a decoy tier."
    assert db.tables["transcripts"][0]["full_text"] == "use a decoy tier"
    assert len(db.tables["cards"]) == 1 and len(db.tables["places"]) == 1
    emb = db.tables["embeddings"][0]
    assert emb["model"] == "gte-small" and emb["vector"].count(",") == 383
    # Only the line that really is in the transcript becomes a highlight, with its time.
    assert db.tables["highlights"] == [{"save_id": "s1", "user_id": OWNER, "source": "ai", "text": "use a decoy tier",
                                        "start_s": 0.0, "end_s": 2.0}]
    assert {(u["kind"], u["provider"]) for u in db.tables["usage"]} == {
        ("transcribe", "groq"), ("understand", "claude"), ("embed", "supabase")}
    assert db.tables["jobs"][0]["state"] == "done"


def test_progress_steps_in_order(db, monkeypatch):
    stub_network(monkeypatch)
    run(db)
    steps = [p["process_step"] for p in db.patches() if "process_step" in p]
    assert steps == ["fetching", "watching", "reading", "filing", "ready"]


def test_title_and_thumbnail_are_written_before_the_download(db, monkeypatch):
    events = stub_network(monkeypatch)
    real_update = db.update

    def spy(table, match, values):
        if table == "saves" and "title" in values:
            events.append("title+thumb patch")
            assert values["thumb_path"] and values["embed_url"] == EMBED and values["playback"] == "embed"
        return real_update(table, match, values)

    db.update = spy
    run(db)
    assert events.index("metadata") < events.index("title+thumb patch") < events.index("download")


def test_video_columns_change_in_one_patch_and_eviction_runs_first(db, monkeypatch):
    stub_network(monkeypatch)
    run(db)
    video_keys = {"video_path", "video_bytes", "video_state", "playback"}
    touching = [p for p in db.patches() if video_keys & set(p) and "title" not in p]
    assert len(touching) == 1 and set(touching[0]) == video_keys
    assert touching[0]["video_state"] == "stored" and touching[0]["playback"] == "video"
    # Every PATCH leaves the row consistent (the database's saves_video_consistent check).
    state = {"video_state": "none", "playback": "link", "video_path": None, "embed_url": None}
    for p in db.patches():
        state.update({k: v for k, v in p.items() if k in state})
        assert (state["video_state"] == "stored") == (state["video_path"] is not None)
        assert state["playback"] != "video" or state["video_state"] == "stored"
        assert state["playback"] != "embed" or state["embed_url"]
    # evict_videos(bytes) → upload → the PATCH
    order = [c for c in db.calls if c[0] in ("rpc", "upload") or (c[0] == "update" and "video_path" in c[2])]
    kinds = [(c[0], c[1]) for c in order if c[1] != f"stash-thumbs/{OWNER}/s1.jpg"]
    assert kinds == [("rpc", "evict_videos"), ("upload", f"stash-video/{OWNER}/s1.mp4"), ("update", "saves")]
    assert order[[c[0] for c in order].index("rpc")][2] == {"p_incoming_bytes": db.tables["saves"][0]["video_bytes"]}


@pytest.mark.parametrize("error,state", [(media.DownloadFailed("login"), "blocked"), (media.TooBig("too long"), "too_big")])
def test_download_refused_keeps_the_embed_player(db, monkeypatch, error, state):
    stub_network(monkeypatch, download=error)
    assert run(db) == "ready"
    save = db.tables["saves"][0]
    assert save["status"] == "ready" and save["video_state"] == state and save["playback"] == "embed"
    assert save.get("video_path") is None and save["error"] is None
    assert save["ai_state"] == "done"  # caption-only insights
    assert not db.tables["transcripts"]


def test_storage_trouble_does_not_fail_the_save(db, monkeypatch):
    stub_network(monkeypatch)
    db.fail_upload = {"stash-video"}
    assert run(db) == "ready"
    save = db.tables["saves"][0]
    assert save["video_state"] == "none" and save["playback"] == "embed" and save.get("video_path") is None
    assert db.tables["transcripts"]  # the downloaded file still gave a transcript


def test_no_key_path_ends_ready_with_title_thumb_and_playback(db, monkeypatch):
    stub_network(monkeypatch)
    monkeypatch.setattr(ai, "understand", lambda c, **kw: pytest.fail("AI called without a key"))
    monkeypatch.setattr(ai, "transcribe", lambda *a, **k: pytest.fail("transcription called without a key"))
    assert run(db, cfg(anthropic_key="", groq_key="")) == "ready"
    save = db.tables["saves"][0]
    assert save["status"] == "ready" and save["ai_state"] == "no_key" and save["error"] is None
    assert save["title"] and save["thumb_path"] and save["playback"] == "video"
    assert not db.tables["insights"]
    assert len(db.tables["embeddings"]) == 1  # search by meaning needs no AI key
    assert db.tables["jobs"][0]["state"] == "done"


def test_a_key_without_a_model_id_is_no_key(db, monkeypatch):
    stub_network(monkeypatch)
    c = cfg(anthropic_key="", gemini_key="k", values={"claude_fast_model": ""})
    assert c.ai_provider is None
    assert run(db, c) == "ready" and db.tables["saves"][0]["ai_state"] == "no_key"


def test_insights_mode_fills_insights_without_downloading(db, monkeypatch):
    events = stub_network(monkeypatch)
    run(db, cfg(anthropic_key="", groq_key=""))
    assert db.tables["saves"][0]["ai_state"] == "no_key"
    events.clear()
    db.calls.clear()
    job = {"id": "j2", "type": "reprocess", "save_id": "s1", "user_id": OWNER, "attempts": 1, "payload": {"mode": "insights"}}
    assert run(db, cfg(), job) == "ready"
    assert events == []  # no metadata fetch, no download from the platform
    save = db.tables["saves"][0]
    assert save["ai_state"] == "done" and save["status"] == "ready" and save["process_step"] == "ready"
    assert db.tables["insights"] and db.tables["transcripts"]  # transcribed from the stored MP4
    assert all(set(p) <= {"ai_state", "space_id"} for p in db.patches())  # status and step are never touched


def test_stranger_gets_metadata_and_embed_but_no_ai_or_video(db, monkeypatch):
    events = stub_network(monkeypatch)
    monkeypatch.setattr(ai, "understand", lambda c, **kw: pytest.fail("AI for a stranger"))
    assert run(db, cfg(owner_user_ids=frozenset({"someone-else"}))) == "ready"
    save = db.tables["saves"][0]
    assert save["status"] == "ready" and save["ai_state"] == "not_owner"
    assert save["video_state"] == "none" and save["playback"] == "embed" and save["title"]
    assert "download" not in events and not db.tables["insights"] and not db.tables["usage"][0]["usd"]


def test_budget_reached_still_ends_ready(db, monkeypatch):
    stub_network(monkeypatch)
    monkeypatch.setattr(ai, "understand", lambda c, **kw: pytest.fail("AI over budget"))
    db.tables["usage"] = [{"user_id": OWNER, "usd": 6, "created_at": "9999-01-01T00:00:00+00:00"}]
    assert run(db) == "ready"
    save = db.tables["saves"][0]
    assert save["status"] == "ready" and save["ai_state"] == "over_budget" and save["playback"] == "video"


def test_provider_error_never_fails_a_save(db, monkeypatch):
    stub_network(monkeypatch)

    def bad(c, **kw):
        err = ai.InsightError("key_idea missing")
        err.tokens, err.usd, err.provider = (900, 40), 0.001, "claude"
        raise err

    monkeypatch.setattr(ai, "understand", bad)
    monkeypatch.setattr(ai, "transcribe", lambda *a, **k: (_ for _ in ()).throw(ai.ProviderError("groq", "transcribe", 503)))
    assert run(db) == "ready"
    save = db.tables["saves"][0]
    assert save["status"] == "ready" and save["ai_state"] == "failed" and save["error"] is None
    assert [u for u in db.tables["usage"] if u["kind"] == "understand"][0]["input_tokens"] == 900  # still billed


def test_dead_link(db, monkeypatch):
    stub_network(monkeypatch, meta=media.DeadLink("404"))
    assert run(db) == "dead_link"
    save = db.tables["saves"][0]
    assert save["status"] == "dead_link" and save["process_step"] == "ready"


def test_unexpected_error_retries_then_fails(db, monkeypatch):
    stub_network(monkeypatch)
    monkeypatch.setattr(db, "embed", lambda texts: (_ for _ in ()).throw(RuntimeError("boom")))
    assert run(db) == "retry"
    assert db.tables["jobs"][0]["state"] == "queued"
    assert db.tables["saves"][0]["status"] == "queued" and db.tables["saves"][0]["process_step"] == "queued"
    assert run(db, job=dict(JOB, attempts=3)) == "failed"
    assert db.tables["saves"][0]["status"] == "failed" and db.tables["saves"][0]["process_step"] == "ready"


def test_a_space_picked_during_processing_is_kept(db, monkeypatch):
    stub_network(monkeypatch)
    real_understand = ai.understand

    def pick_then_understand(c, **kw):
        db.tables["saves"][0]["space_id"] = "food"  # the owner taps a Space mid-job
        return real_understand(c, **kw)

    monkeypatch.setattr(ai, "understand", pick_then_understand)
    assert run(db) == "ready"
    assert db.tables["saves"][0]["space_id"] == "food"


def test_web_article_is_read_not_downloaded(db, monkeypatch):
    db.tables["saves"][0].update(source_url="https://example.com/post", platform="web")
    seen = {}
    events = stub_network(monkeypatch, meta=media.Meta(title="A post", creator="example.com", caption="About pricing",
                                                       thumb_url=None, article="Long article text about decoy pricing.",
                                                       found=True))
    monkeypatch.setattr(ai, "understand", lambda c, **kw: seen.update(kw) or ai.Understanding(dict(INSIGHTS), 1, 1, 0, "claude"))
    assert run(db) == "ready"
    save = db.tables["saves"][0]
    assert save["playback"] == "link" and save["video_state"] == "none" and save["embed_url"] is None
    assert db.tables["transcripts"][0] == {"save_id": "s1", "user_id": OWNER, "segments": [],
                                           "full_text": "Long article text about decoy pricing."}
    assert seen["transcript"].startswith("Long article") and "download" not in events


def test_youtube_is_embed_only_with_captions(db, monkeypatch):
    db.tables["saves"][0].update(source_url="https://youtu.be/dQw4w9WgXcQ", platform="youtube")
    yt = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
    events = stub_network(monkeypatch, meta=media.Meta(title="A talk", creator="@chan", embed_url=yt, found=True))
    monkeypatch.setattr(media, "youtube_captions", lambda url: {
        "segments": [{"start": 1.0, "end": 3.0, "text": "use a decoy tier"}], "language": "en",
        "info": {"duration": 120, "description": "Described"}})
    monkeypatch.setattr(ai, "transcribe", lambda *a, **k: pytest.fail("captions exist: nothing to transcribe"))
    assert run(db) == "ready"
    save = db.tables["saves"][0]
    assert save["playback"] == "embed" and save["video_state"] == "none" and save["embed_url"] == yt
    assert save["duration_s"] == 120 and save["caption"] == "Described" and "download" not in events
    assert db.tables["transcripts"][0]["segments"][0]["start"] == 1.0
    assert "transcribe" not in {u["kind"] for u in db.tables["usage"]}  # the platform's captions cost nothing
    # …and the download happens once it is switched on
    events.clear()
    db.tables["saves"][0].update(video_state="none", playback="embed")
    assert run(db, cfg(values={"youtube_download": "on"})) == "ready" and "download" in events


def test_the_platform_is_read_from_the_address_not_the_row(db, monkeypatch):
    db.tables["saves"][0].update(source_url="http://169.254.169.254/latest/meta-data", platform="tiktok")
    events = stub_network(monkeypatch, meta=media.Meta())
    assert run(db) == "ready"
    assert "download" not in events and db.tables["saves"][0]["platform"] == "web"


# --- run loop and trash -----------------------------------------------------------------

def test_run_reports_the_four_counters_and_empties_the_trash(db, monkeypatch):
    stub_network(monkeypatch)
    queue = [dict(JOB, state="running")]
    db.tables["jobs"] = list(queue)
    db.tables["media_trash"] = [{"id": i, "store": "storage", "bucket": "stash-video", "path": f"{OWNER}/{i}.mp4"}
                                for i in range(60)] + [{"id": 99, "store": "r2", "bucket": None, "path": "old"}]
    monkeypatch.setattr(db, "rpc", lambda fn, args: [queue.pop()] if fn == "claim_jobs" and queue else [])
    assert pipeline.run(db, cfg()) == {"done": 1, "failed": 0, "requeued": 0, "trashed": 50}
    removed = [c for c in db.calls if c[0] == "remove"]
    assert len(removed) == 1 and removed[0][1] == "stash-video" and len(removed[0][2]) == 50
    assert len(db.tables["media_trash"]) == 11


def test_run_stops_claiming_after_the_budget(db):
    clock = iter([0, 0, 500, 500, 500])
    claimed = []
    db.rpc = lambda fn, args: claimed.append(fn) or [{"id": "x", "type": "nope", "user_id": OWNER}]
    db.tables["jobs"] = [{"id": "x"}]
    out = pipeline.run(db, cfg(), clock=lambda: next(clock))
    assert claimed == ["claim_jobs"] and out["failed"] == 1
