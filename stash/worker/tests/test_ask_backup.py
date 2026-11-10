"""`ask` and `backup` jobs."""

from __future__ import annotations

import json

import pytest

from stash_worker import ai, backup, pipeline
from stash_worker.proxy import ProxyError

from test_pipeline import OWNER, FakeSupa, cfg

STRANGER = "u-stranger"
CONTEXT = [{"save_id": "s1", "title": "Decoy pricing", "key_idea": "Use a decoy tier."},
           {"save_id": "s2", "title": "Anchoring", "key_idea": "Anchor high."}]


@pytest.fixture()
def db():
    d = FakeSupa()
    d.tables.update({"asks": [{"id": "a1", "user_id": OWNER, "question": "How should I price?", "status": "queued",
                               "answer": None, "cited_save_ids": []}], "backups": []})
    d.tables["settings"] = [{"user_id": OWNER, "monthly_budget_usd": 5}]
    d.context = list(CONTEXT)

    def rpc(fn, args):
        d.calls.append(("rpc", fn, dict(args)))
        return d.context if fn == "ask_context" else []

    d.rpc = rpc
    return d


JOB = {"id": "j1", "type": "ask", "user_id": OWNER, "attempts": 1, "payload": {"ask_id": "a1"}}


def run(db, c=None, job=JOB):
    db.tables["jobs"] = [dict(job, state="running")]
    return pipeline.process_job(db, c or cfg(), job)


def answer(cited):
    return lambda c, **kw: ai.Answer("Use a decoy tier.", cited, 800, 60, 0.001, "claude")


def test_ask_answers_from_the_context_with_citations(db, monkeypatch):
    seen = {}
    monkeypatch.setattr(ai, "ask", lambda c, **kw: seen.update(kw) or answer(["s2", "s1"])(c))
    assert run(db) == "asked"
    row = db.tables["asks"][0]
    assert row["status"] == "ready" and row["answer"] == "Use a decoy tier." and row["cited_save_ids"] == ["s2", "s1"]
    assert seen["question"] == "How should I price?" and seen["context"] == CONTEXT
    ctx = [c for c in db.calls if c[:2] == ("rpc", "ask_context")][0][2]
    assert ctx["p_user_id"] == OWNER and ctx["p_limit"] == 8 and ctx["p_embedding"].startswith("[0.05")
    assert [p.get("status") for p in db.patches("asks")] == ["running", "ready"]
    assert db.tables["usage"][0]["kind"] == "ask" and db.tables["jobs"][0]["state"] == "done"


def test_ask_keeps_only_cited_ids_that_were_in_the_context(db, monkeypatch):
    monkeypatch.setattr(ai, "ask", answer(["s2", "someone-elses-save", "s2x"]))
    run(db)
    assert db.tables["asks"][0]["cited_save_ids"] == ["s2"]


def test_ask_of_someone_elses_question_is_refused_untouched(db, monkeypatch):
    monkeypatch.setattr(ai, "ask", lambda *a, **k: pytest.fail("AI called for a mismatched ask"))
    assert run(db, job=dict(JOB, user_id=STRANGER)) == "owner_mismatch"
    assert db.tables["asks"][0]["status"] == "queued" and db.tables["jobs"][0]["error"] == "owner_mismatch"
    assert not [c for c in db.calls if c[0] in ("rpc", "embed")]  # nothing was read for them
    assert run(db, job=dict(JOB, user_id=None)) == "owner_mismatch"


def test_ask_with_nothing_relevant_needs_no_ai(db, monkeypatch):
    monkeypatch.setattr(ai, "ask", lambda *a, **k: pytest.fail("nothing to answer from"))
    db.context = []
    assert run(db, cfg(anthropic_key="")) == "asked"
    row = db.tables["asks"][0]
    assert row["status"] == "ready" and row["answer"] == "Nothing in your saves about that yet." and row["cited_save_ids"] == []


def test_ask_without_a_provider_fails_with_no_ai(db):
    assert run(db, cfg(anthropic_key="")) == "ai_off"
    assert db.tables["asks"][0]["status"] == "failed" and db.tables["asks"][0]["error"] == "no_ai"
    assert db.tables["jobs"][0]["state"] == "failed"


def test_ask_gates_and_provider_errors(db, monkeypatch):
    assert run(db, cfg(owner_user_ids=frozenset({"x"}))) == "not_owner"
    assert db.tables["asks"][0]["error"] == "not_owner"
    db.tables["asks"][0]["status"] = "queued"
    monkeypatch.setattr(ai, "ask", lambda c, **kw: (_ for _ in ()).throw(ai.ProviderError("claude", "messages", 500)))
    assert run(db) == "failed" and db.tables["asks"][0]["error"] == "ai_error"
    # an ask that already has its answer is not answered twice
    db.tables["asks"][0]["status"] = "ready"
    monkeypatch.setattr(ai, "ask", lambda *a, **k: pytest.fail("answered twice"))
    assert run(db) == "asked"


def test_ask_still_works_on_words_when_the_embedding_fails(db, monkeypatch):
    monkeypatch.setattr(db, "embed", lambda texts: (_ for _ in ()).throw(ProxyError("POST /embed", 503)))
    monkeypatch.setattr(ai, "ask", answer(["s1"]))
    assert run(db) == "asked"
    assert [c for c in db.calls if c[:2] == ("rpc", "ask_context")][0][2]["p_embedding"] is None


def test_a_missing_ask_finishes_the_job(db):
    assert run(db, job=dict(JOB, payload={"ask_id": "nope"})) == "gone"
    assert run(db, job=dict(JOB, payload={})) == "gone"


# --- backup -----------------------------------------------------------------------------

@pytest.fixture()
def bdb(db):
    for t in backup.TABLES:
        db.tables.setdefault(t, [])
    db.tables["saves"] = [{"id": f"s{i}", "user_id": OWNER, "title": f"Café {i}"} for i in range(3)] + \
                         [{"id": "x", "user_id": STRANGER, "title": "not mine"}]
    db.tables["transcripts"] = [{"save_id": "s0", "user_id": OWNER, "full_text": "hi", "tsv": "'hi':1"}]
    db.tables["backups"] = [{"id": f"b{i}", "user_id": OWNER, "path": f"{OWNER}/backups/2026-0{i}-01.json",
                             "created_at": f"2026-0{i}-01T04:41:00+00:00"} for i in range(1, 6)] + \
                           [{"id": "theirs", "user_id": STRANGER, "path": f"{STRANGER}/backups/2026-01-01.json",
                             "created_at": "2026-01-01T00:00:00+00:00"}]
    return db


BJOB = {"id": "b1", "type": "backup", "user_id": OWNER, "attempts": 1, "payload": {}}


def test_backup_writes_one_json_file_of_the_owners_rows(bdb):
    assert run(bdb, job=BJOB) == "backed_up"
    key = next(k for k in bdb.files if k.startswith(f"stash-exports/{OWNER}/backups/"))
    assert key.endswith(".json") and ("upload", key, "application/json") in bdb.calls
    doc = json.loads(bdb.files[key])
    assert doc["version"] == 1 and doc["user_id"] == OWNER and set(doc["tables"]) == set(backup.TABLES)
    assert [s["id"] for s in doc["tables"]["saves"]] == ["s0", "s1", "s2"]  # nobody else's rows
    assert doc["tables"]["saves"][0]["title"] == "Café 0" and "tsv" not in doc["tables"]["transcripts"][0]
    row = next(b for b in bdb.tables["backups"] if b["path"] == key.removeprefix("stash-exports/"))
    assert row["saves"] == 3 and row["bytes"] == len(bdb.files[key])
    assert bdb.tables["usage"][-1]["kind"] == "backup" and bdb.tables["jobs"][0]["state"] == "done"


def test_backup_keeps_the_newest_four_and_never_touches_other_users(bdb):
    run(bdb, job=BJOB)
    mine = sorted(b["id"] for b in bdb.tables["backups"] if b["user_id"] == OWNER and "id" in b)
    assert mine == ["b3", "b4", "b5"]  # + today's = 4 kept; b1 and b2 went
    assert len([b for b in bdb.tables["backups"] if b["user_id"] == OWNER]) == 4
    assert any(b["id"] == "theirs" for b in bdb.tables["backups"] if "id" in b)
    # the same day again replaces today's row instead of adding one
    run(bdb, job=BJOB)
    assert len([b for b in bdb.tables["backups"] if b["user_id"] == OWNER]) == 4


def test_backup_keep_is_configurable_and_backups_are_for_owners(bdb):
    run(bdb, cfg(values={"backup_keep": "2"}), BJOB)
    assert len([b for b in bdb.tables["backups"] if b["user_id"] == OWNER]) == 2
    assert run(bdb, cfg(owner_user_ids=frozenset({"x"})), BJOB) == "not_owner"


def test_backup_pages_through_large_tables(bdb, monkeypatch):
    monkeypatch.setattr(backup, "PAGE", 2)
    run(bdb, job=BJOB)
    key = next(k for k in bdb.files if "/backups/" in k)
    assert len(json.loads(bdb.files[key])["tables"]["saves"]) == 3


def test_a_failed_upload_retries_the_job(bdb):
    bdb.fail_upload = {"stash-exports"}
    assert run(bdb, job=BJOB) == "retry"
    assert not [b for b in bdb.tables["backups"] if b.get("saves") == 3]
