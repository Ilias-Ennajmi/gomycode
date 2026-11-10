"""Every job handler refuses rows that belong to someone other than the job's user, before any
AI spend; a crashing job never stops the run; a late worker grade can't undo a self-grade."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from stash_worker import ai, exports, galaxy, pipeline

from test_pipeline import OWNER, FakeSupa, cfg

STRANGER = "u-stranger"


def no_ai(monkeypatch):
    def boom(*a, **k):
        raise AssertionError("AI called for a mismatched job")

    for name in ("understand", "grade_answer", "synthesize", "transcribe", "ask", "read_screenshot", "structured"):
        if hasattr(ai, name):
            monkeypatch.setattr(ai, name, boom)
    monkeypatch.setattr(exports, "write_brief", boom)


@pytest.fixture()
def db():
    d = FakeSupa()
    d.tables.update({"exports": [], "reviews": [], "syntheses": [], "galaxy_points": [],
                     "galaxy_clusters": [], "galaxy_layouts": []})
    d.tables["settings"] = [{"user_id": OWNER, "monthly_budget_usd": 5}]
    d.tables["spaces"] = [{"id": "sp", "name": "Owner space", "kind": "topic", "user_id": OWNER, "archived": False,
                           "color_token": "violet", "description": None, "due_date": None}]
    d.tables["saves"] = [{"id": "s1", "user_id": OWNER, "source_url": "https://www.instagram.com/reel/x/",
                          "platform": "instagram", "space_id": "sp", "status": "ready"}]
    d.tables["cards"] = [{"id": "c1", "save_id": "s1", "user_id": OWNER, "prompt": "q", "answer": "a",
                          "ease": 2.5, "interval_days": 0, "repetitions": 0,
                          "due_at": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()}]
    return d


def run_one(d, job):
    d.tables["jobs"] = [dict(job, state="running")]
    return pipeline.process_job(d, cfg(), job)


def test_ingest_of_someone_elses_save_is_refused(db, monkeypatch):
    no_ai(monkeypatch)
    job = {"id": "j", "type": "ingest", "save_id": "s1", "user_id": STRANGER, "attempts": 1}
    assert run_one(db, job) == "owner_mismatch"
    assert db.tables["jobs"][0]["state"] == "failed"
    assert db.tables["saves"][0]["status"] == "ready" and "error" not in db.tables["saves"][0]


def test_reprocess_without_a_user_is_refused(db, monkeypatch):
    no_ai(monkeypatch)
    job = {"id": "j", "type": "reprocess", "save_id": "s1", "attempts": 1}
    assert run_one(db, job) == "owner_mismatch"


def test_synthesize_of_someone_elses_space_is_refused(db, monkeypatch):
    no_ai(monkeypatch)
    job = {"id": "j", "type": "synthesize", "space_id": "sp", "user_id": STRANGER, "attempts": 1}
    assert run_one(db, job) == "owner_mismatch"
    assert not db.tables["syntheses"] and not db.tables["usage"]


def test_grade_of_someone_elses_card_is_refused(db, monkeypatch):
    no_ai(monkeypatch)
    job = {"id": "j", "type": "grade", "user_id": STRANGER, "attempts": 1, "payload": {"card_id": "c1", "text": "x"}}
    assert run_one(db, job) == "owner_mismatch"
    assert not db.tables["reviews"]


def test_export_of_someone_elses_export_is_refused(db, monkeypatch):
    no_ai(monkeypatch)
    db.tables["exports"] = [{"id": "e", "user_id": OWNER, "space_id": "sp", "kind": "brief", "options": {},
                             "status": "queued"}]
    job = {"id": "j", "type": "export", "user_id": STRANGER, "attempts": 1, "payload": {"export_id": "e"}}
    assert run_one(db, job) == "owner_mismatch"
    assert db.tables["exports"][0]["status"] == "queued"  # the row isn't the job's to touch


def test_export_pointing_at_someone_elses_space_is_refused(db, monkeypatch):
    no_ai(monkeypatch)
    db.tables["spaces"].append({"id": "theirs", "name": "Theirs", "kind": "topic", "user_id": STRANGER})
    db.tables["exports"] = [{"id": "e", "user_id": OWNER, "space_id": "theirs", "kind": "brief", "options": {},
                             "status": "queued"}]
    job = {"id": "j", "type": "export", "user_id": OWNER, "attempts": 1, "payload": {"export_id": "e"}}
    assert run_one(db, job) == "owner_mismatch"
    assert db.tables["exports"][0]["status"] == "failed"


def test_galaxy_crash_backs_off_instead_of_raising(db, monkeypatch):
    monkeypatch.setattr(galaxy, "_all", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("db down")))
    job = {"id": "j", "type": "galaxy", "user_id": OWNER, "attempts": 1}
    assert run_one(db, job) == "retry"
    assert db.tables["jobs"][0]["state"] == "queued" and db.tables["jobs"][0]["run_after"]


def test_run_survives_a_job_that_raises(db, monkeypatch):
    jobs = [[{"id": "j1", "type": "ingest", "save_id": "s1", "user_id": OWNER, "attempts": 3}], []]
    db.tables["jobs"] = [dict(jobs[0][0], state="running")]
    monkeypatch.setattr(db, "rpc", lambda fn, args: jobs.pop(0) if fn == "claim_jobs" else [])
    monkeypatch.setattr(pipeline, "process_job", lambda *a: (_ for _ in ()).throw(KeyError("boom")))
    summary = pipeline.run(db, cfg())
    assert summary.get("failed") == 1
    assert db.tables["jobs"][0]["state"] == "failed"


def test_late_worker_grade_does_not_override_a_self_grade(db, monkeypatch):
    seen_due = db.tables["cards"][0]["due_at"]

    def grade_and_meanwhile_self_grade(c, **kw):
        # The owner taps "Got it" while the worker is grading: the card moves on.
        db.tables["cards"][0].update(due_at="2099-01-01T00:00:00+00:00", repetitions=1, interval_days=6)
        return ai.Grade(1, "Missed.", 10, 5, 0.0001)

    monkeypatch.setattr(ai, "grade_answer", grade_and_meanwhile_self_grade)
    job = {"id": "j", "type": "grade", "user_id": OWNER, "attempts": 1, "payload": {"card_id": "c1", "text": "x"}}
    assert run_one(db, job) == "graded"
    card = db.tables["cards"][0]
    assert card["due_at"] == "2099-01-01T00:00:00+00:00" and card["repetitions"] == 1  # self-grade kept
    assert seen_due != card["due_at"]
    assert len(db.tables["reviews"]) == 1  # the worker's review is still recorded
