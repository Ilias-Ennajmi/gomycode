"""The run's deadline and the "try again later" path.

The function is killed at its maximum duration without warning, so nothing slow may start (or go
on) when it could not finish, and a save must never be left in `processing`. A busy provider
(429 / 503 / 529) is the same case from the save's point of view: it ends `ready` with
`ai_state = 'retry'` and the sweep re-queues its insights."""

from __future__ import annotations

import time

import httpx
import pytest

from stash_worker import ai, deadline, pipeline
from stash_worker.providers import Gemini, Groq, ProviderError, _request
from stash_worker.proxy import Proxy, ProxyError

from fakes import FakeHttp, Resp
from test_pipeline import JOB, OWNER, cfg, db, run, stub_network  # noqa: F401 — db is a fixture
from test_providers import SECRET, gemini_answer, nosleep


@pytest.fixture()
def left():
    """Sets how many seconds the run has left; restored afterwards."""
    tokens = []

    def set_left(seconds: float | None):
        tokens.append(deadline.set_deadline(None if seconds is None else time.monotonic() + seconds))

    yield set_left
    for t in reversed(tokens):
        deadline.reset(t)


def test_no_deadline_means_no_limit_and_a_deadline_caps_timeouts(left):
    assert deadline.remaining() is None and deadline.has(10_000) and deadline.cap(180) == 180
    left(100)
    assert 99 < deadline.remaining() <= 100 and deadline.has(90) and not deadline.has(101)
    assert 94 < deadline.cap(180) <= 95 and deadline.cap(30) == 30  # 5 s kept back to write the result
    left(4)
    with pytest.raises(deadline.OutOfTime):
        deadline.cap(180)


# --- provider calls ---------------------------------------------------------------------------

@pytest.mark.parametrize("status,later", [(429, True), (503, True), (529, True), (500, False), (502, False), (400, False), (401, False)])
def test_busy_statuses_ask_for_a_later_retry_and_real_errors_do_not(status, later):
    assert ProviderError("gemini", "generate", status).retry_later is later
    http = FakeHttp([Resp(status)] * 6)
    with pytest.raises(ProviderError) as e:
        Gemini(SECRET, http, nosleep).structured(model="m", system="s", tool=ai.GRADE_TOOL, content="c")
    assert e.value.retry_later is later and SECRET not in str(e.value)


def test_a_provider_call_is_bounded_by_the_time_left(left):
    http = FakeHttp([gemini_answer({"verdict": "got", "feedback": ""})])
    Gemini(SECRET, http, nosleep).structured(model="m", system="s", tool=ai.GRADE_TOOL, content="c")
    assert "timeout" not in http.requests[0]  # no deadline: the client's own timeout

    left(40)
    http = FakeHttp([gemini_answer({"verdict": "got", "feedback": ""})])
    Gemini(SECRET, http, nosleep).structured(model="m", system="s", tool=ai.GRADE_TOOL, content="c")
    t = http.requests[0]["timeout"]
    assert isinstance(t, httpx.Timeout) and 34 < t.read <= 35 and t.connect == 10


def test_a_provider_call_is_not_started_or_repeated_without_time(left, tmp_path):
    left(6)  # under the margin + the minimum for a call
    http = FakeHttp([])
    with pytest.raises(ProviderError) as e:
        Gemini(SECRET, http, nosleep).structured(model="m", system="s", tool=ai.GRADE_TOOL, content="c")
    assert e.value.retry_later and http.requests == [] and "out of time" in str(e.value)
    clip = tmp_path / "v.mp4"
    clip.write_bytes(b"x" * 100)
    with pytest.raises(ProviderError) as e:
        Groq(SECRET, http, nosleep).transcribe(model="w", path=clip, mime="video/mp4")
    assert e.value.retry_later and http.requests == []

    # Busy, and waiting 12 s for the next try would run into the deadline: stop now, retry later.
    left(15)
    slept = []
    http = FakeHttp([Resp(429, headers={"retry-after": "30"})])
    with pytest.raises(ProviderError) as e:
        _request("gemini", "generate", http, "POST", "https://x", sleep=slept.append)
    assert e.value.retry_later and e.value.status == 429 and slept == [] and len(http.requests) == 1


def test_a_timeout_caused_by_the_deadline_is_a_later_retry_not_a_failure(left):
    def timeout(method, url, kw):
        left(2)  # the call used up the run
        raise httpx.ReadTimeout("slow")

    left(30)
    with pytest.raises(ProviderError) as e:
        _request("gemini", "generate", FakeHttp([timeout]), "POST", "https://x", sleep=nosleep, retries=0)
    assert e.value.retry_later
    left(None)
    with pytest.raises(ProviderError) as e:  # plenty of time: an ordinary provider failure
        _request("gemini", "generate", FakeHttp([lambda *a: (_ for _ in ()).throw(httpx.ReadTimeout("slow"))]),
                 "POST", "https://x", sleep=nosleep, retries=0)
    assert not e.value.retry_later


# --- the Storage upload -------------------------------------------------------------------------

def test_the_storage_put_is_bounded_by_the_time_left(left, tmp_path):
    signed = Resp(200, {"url": "https://x.supabase.co/storage/v1/object/upload/sign/stash-video/u/s.mp4?token=abc"})
    clip = tmp_path / "v.mp4"
    clip.write_bytes(b"0123456789")

    left(60)
    plain = FakeHttp([Resp(200)])
    Proxy("https://x.supabase.co", "t" * 64, http=FakeHttp([signed]), plain=plain).upload("stash-video", "u/s.mp4", clip, "video/mp4")
    assert 54 < plain.requests[0]["timeout"].read <= 55

    left(8)
    plain = FakeHttp([])
    with pytest.raises(ProxyError, match="out of time"):
        Proxy("https://x.supabase.co", "t" * 64, http=FakeHttp([signed]), plain=plain).upload("stash-video", "u/s.mp4", clip, "video/mp4")
    assert plain.requests == []


# --- the ingest ------------------------------------------------------------------------------------

def test_with_little_time_left_the_save_ends_ready_and_asks_for_a_retry(db, monkeypatch, left):  # noqa: F811
    events = stub_network(monkeypatch)
    called = []
    monkeypatch.setattr(ai, "transcribe", lambda *a, **k: called.append("transcribe"))
    monkeypatch.setattr(ai, "understand", lambda *a, **k: called.append("understand"))
    left(50)  # under DOWNLOAD_NEEDS_S and AI_NEEDS_S
    assert run(db) == "ready"
    save = db.tables["saves"][0]
    assert events == ["metadata"] and called == []  # no download, no AI call
    assert save["status"] == "ready" and save["process_step"] == "ready" and save["ai_state"] == "retry"
    assert save["title"] == "Pricing trick" and save["playback"] == "embed" and save["video_state"] == "none"
    assert db.tables["embeddings"] and db.tables["jobs"][0]["state"] == "done"

    # The sweep's insights job, in a later run with time: transcript and insights, nothing fetched again.
    left(None)
    monkeypatch.undo()
    events = stub_network(monkeypatch)
    job = {"id": "j2", "type": "reprocess", "save_id": "s1", "user_id": OWNER, "attempts": 1, "payload": {"mode": "insights"}}
    assert run(db, cfg(), job) == "ready"
    assert events == [] and db.tables["saves"][0]["ai_state"] == "done" and db.tables["insights"]


def test_a_download_stopped_for_time_is_not_called_blocked(db, monkeypatch, left):  # noqa: F811
    stub_network(monkeypatch, download=deadline.OutOfTime("out of time"))
    assert run(db) == "ready"
    save = db.tables["saves"][0]
    assert save["video_state"] == "none" and save["playback"] == "embed" and save["status"] == "ready"


def test_time_running_out_after_the_transcript_skips_only_the_insights(db, monkeypatch, left):  # noqa: F811
    stub_network(monkeypatch)
    called = []

    def slow_transcribe(c, path, mime="video/mp4", seconds=0.0):
        left(20)  # transcription used the run up
        return ai.Transcript([{"start": 0.0, "end": 2.0, "text": "use a decoy tier"}], "use a decoy tier", "en", 30.0, provider="groq")

    monkeypatch.setattr(ai, "transcribe", slow_transcribe)
    monkeypatch.setattr(ai, "understand", lambda *a, **k: called.append("understand"))
    left(200)
    assert run(db) == "ready"
    save = db.tables["saves"][0]
    assert called == [] and save["ai_state"] == "retry" and save["status"] == "ready"
    assert db.tables["transcripts"][0]["full_text"] == "use a decoy tier"  # kept: the retry will not pay for it again


@pytest.mark.parametrize("status,state", [(429, "retry"), (503, "retry"), (529, "retry"), (500, "failed")])
def test_a_busy_provider_marks_the_save_for_retry_instead_of_failed(db, monkeypatch, status, state):  # noqa: F811
    stub_network(monkeypatch)
    monkeypatch.setattr(ai, "understand", lambda c, **kw: (_ for _ in ()).throw(ai.ProviderError("gemini", "generate", status)))
    assert run(db) == "ready"
    save = db.tables["saves"][0]
    assert save["status"] == "ready" and save["ai_state"] == state and save["error"] is None
    assert db.tables["jobs"][0]["state"] == "done"


def test_a_busy_transcription_waits_for_the_retry_with_the_insights(db, monkeypatch):  # noqa: F811
    stub_network(monkeypatch)
    called = []
    monkeypatch.setattr(ai, "transcribe", lambda *a, **k: (_ for _ in ()).throw(ai.ProviderError("groq", "transcribe", 429)))
    monkeypatch.setattr(ai, "understand", lambda *a, **k: called.append("understand"))
    assert run(db) == "ready"
    save = db.tables["saves"][0]
    assert called == [] and save["ai_state"] == "retry" and save["video_state"] == "stored" and save["status"] == "ready"


def test_a_busy_vision_call_marks_the_screenshot_for_retry(db, monkeypatch):  # noqa: F811
    db.tables["saves"][0].update(source_url="screenshot:0f8fad5b-d9cb-469f-a165-70867728950e.jpg", platform="screenshot")
    db.files[f"stash-thumbs/{OWNER}/screenshots/0f8fad5b-d9cb-469f-a165-70867728950e.jpg"] = b"\xff\xd8\xffjpeg"
    monkeypatch.setattr(ai, "read_screenshot", lambda c, **kw: (_ for _ in ()).throw(ai.ProviderError("gemini", "generate", 503)))
    assert run(db) == "ready"
    assert db.tables["saves"][0]["ai_state"] == "retry" and db.tables["saves"][0]["status"] == "ready"


# --- the run loop ------------------------------------------------------------------------------------

def test_run_sets_the_deadline_from_the_functions_maximum_and_clears_it(db, monkeypatch):  # noqa: F811
    seen = []
    queue = [dict(JOB, state="running")]
    monkeypatch.setattr(db, "rpc", lambda fn, args: [queue.pop()] if fn == "claim_jobs" and queue else [])
    monkeypatch.setattr(pipeline, "_process_job", lambda supa, c, job: seen.append(deadline.remaining()) or "ready")
    pipeline.run(db, cfg())
    assert 284 < seen[0] <= 285  # 300 s maximum, 15 s kept back
    assert pipeline.HARD_LIMIT_S == 285 and deadline.remaining() is None

    queue.append(dict(JOB, state="running"))
    pipeline.run(db, cfg(values={"worker_max_seconds": "120"}))
    assert 104 < seen[1] <= 105


def test_run_claims_nothing_with_under_90_seconds_left(db, monkeypatch):  # noqa: F811
    claimed = []
    monkeypatch.setattr(db, "rpc", lambda fn, args: claimed.append(fn) or [])
    db.tables["media_trash"] = [{"id": 1, "store": "storage", "bucket": "stash-video", "path": f"{OWNER}/1.mp4"}]
    out = pipeline.run(db, cfg(values={"worker_max_seconds": "100"}))  # 85 s to the deadline
    assert claimed == [] and out == {"done": 0, "failed": 0, "requeued": 0, "trashed": 1}

    # A job that used the time up is the last one of this run.
    queue = [dict(JOB, id="j1", state="running"), dict(JOB, id="j2", state="running")]
    monkeypatch.setattr(db, "rpc", lambda fn, args: claimed.append(fn) or ([queue.pop(0)] if queue else []))

    def slow(supa, c, job):
        deadline.set_deadline(time.monotonic() + 60)
        return "ready"

    monkeypatch.setattr(pipeline, "_process_job", slow)
    assert pipeline.run(db, cfg())["done"] == 1 and claimed == ["claim_jobs"] and len(queue) == 1


# --- ask ------------------------------------------------------------------------------------------------

def test_a_busy_provider_requeues_the_question_then_gives_up(db, monkeypatch):  # noqa: F811
    db.tables["asks"] = [{"id": "a1", "user_id": OWNER, "question": "How should I price?", "status": "queued",
                          "answer": None, "cited_save_ids": []}]
    db.rpc = lambda fn, args: [{"save_id": "s1", "title": "Decoy", "key_idea": "Use a decoy tier."}] if fn == "ask_context" else []
    monkeypatch.setattr(ai, "ask", lambda c, **kw: (_ for _ in ()).throw(ai.ProviderError("gemini", "generate", 429)))
    job = {"id": "j1", "type": "ask", "user_id": OWNER, "attempts": 1, "payload": {"ask_id": "a1"}}
    assert run(db, job=job) == "retry"
    assert db.tables["asks"][0]["status"] == "queued" and db.tables["asks"][0].get("error") is None
    queued = db.tables["jobs"][0]
    assert queued["state"] == "queued" and queued["run_after"] and queued["error"] == "busy"

    assert run(db, job=dict(job, attempts=3)) == "failed"
    assert db.tables["asks"][0]["status"] == "failed" and db.tables["asks"][0]["error"] == "ai_error"
