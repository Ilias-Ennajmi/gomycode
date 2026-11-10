"""Phase 2 jobs: grading recall answers and Space syntheses, plus the Claude tool-call contract."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from stash_worker import ai, pipeline
from stash_worker.rules import InsightError, normalize_grade, normalize_synthesis, sm2

from test_pipeline import OWNER, FakeSupa, cfg


class LoopSupa(FakeSupa):
    def __init__(self):
        super().__init__()
        self.tables.update({"reviews": [], "syntheses": []})
        self.files: dict[str, bytes] = {}
        self.removed: list[str] = []

    def download(self, bucket, path):
        return self.files[f"{bucket}/{path}"]

    def remove(self, bucket, paths):
        self.removed += [f"{bucket}/{p}" for p in paths]


def _iso(days: float) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


@pytest.fixture()
def db():
    d = LoopSupa()
    d.tables["settings"] = [{"user_id": OWNER, "monthly_budget_usd": 5}]
    d.tables["cards"] = [{"id": "c1", "save_id": "s1", "user_id": OWNER, "prompt": "What does a decoy tier do?",
                          "answer": "Makes the middle option look like the deal.", "ease": 2.5,
                          "interval_days": 0, "repetitions": 0, "due_at": _iso(-1)}]
    d.tables["insights"] = [{"save_id": "s1", "key_idea": "Add a decoy tier."}]
    return d


GRADE_JOB = {"id": "g1", "type": "grade", "user_id": OWNER, "attempts": 1, "payload": {"card_id": "c1", "text": "it makes the middle look cheap"}}


def stub_grade(monkeypatch, verdict="got", calls=None):
    def fake(c, **kw):
        if calls is not None:
            calls.append(kw)
        return ai.Grade(normalize_grade({"verdict": verdict, "feedback": "Right."})["grade"], "Right.", 300, 20, 0.0004)

    monkeypatch.setattr(ai, "grade_answer", fake)


# --- grade -----------------------------------------------------------------------

def test_typed_answer_is_graded_and_scheduled(db, monkeypatch):
    calls: list = []
    stub_grade(monkeypatch, "got", calls)
    db.tables["jobs"] = [dict(GRADE_JOB, state="running")]
    assert pipeline.process_job(db, cfg(), GRADE_JOB) == "graded"
    review = db.tables["reviews"][0]
    assert review["grade"] == 5 and review["voice_answer_text"] == "it makes the middle look cheap"
    assert review["feedback"] == "Right."
    assert calls[0]["key_idea"] == "Add a decoy tier."
    card = db.tables["cards"][0]
    assert card["repetitions"] == 1 and card["interval_days"] == 1
    assert card["due_at"] > _iso(0.9)
    assert {u["kind"] for u in db.tables["usage"]} == {"grade"}
    assert db.tables["jobs"][0]["state"] == "done"


def test_voice_answer_is_transcribed_then_removed(db, monkeypatch):
    stub_grade(monkeypatch, "partly")
    path = f"{OWNER}/answers/c1-1.webm"
    db.files[f"stash-voice/{path}"] = b"audio"
    seen = {}

    def fake_transcribe(c, audio, mime="audio/mpeg"):
        seen["mime"] = mime
        return ai.Transcript([], "the middle looks cheaper", "en", 4.0)

    monkeypatch.setattr(ai, "transcribe", fake_transcribe)
    job = dict(GRADE_JOB, payload={"card_id": "c1", "audio_path": path})
    assert pipeline.process_job(db, cfg(), job) == "graded"
    assert seen["mime"] == "audio/webm"
    assert db.tables["reviews"][0]["voice_answer_text"] == "the middle looks cheaper"
    assert db.tables["reviews"][0]["grade"] == 3
    assert {u["kind"] for u in db.tables["usage"]} == {"transcribe", "grade"}
    assert db.removed == [f"stash-voice/{path}"]


def test_audio_outside_the_owners_folder_is_refused(db, monkeypatch):
    stub_grade(monkeypatch)
    job = dict(GRADE_JOB, payload={"card_id": "c1", "audio_path": "someone-else/answers/x.webm"})
    db.tables["jobs"] = [dict(job, state="running")]
    assert pipeline.process_job(db, cfg(), job) == "failed"
    assert db.tables["jobs"][0]["error"] == "bad_path"
    assert not db.tables["reviews"]


def test_self_graded_card_keeps_its_schedule(db, monkeypatch):
    stub_grade(monkeypatch, "missed")
    db.tables["cards"][0].update({"due_at": _iso(6), "repetitions": 2, "interval_days": 6})
    assert pipeline.process_job(db, cfg(), GRADE_JOB) == "graded"
    assert db.tables["reviews"][0]["grade"] == 1  # history kept
    assert db.tables["cards"][0]["repetitions"] == 2  # not reset by the late grade


def test_grade_respects_owner_gate_and_budget(db, monkeypatch):
    stub_grade(monkeypatch)
    assert pipeline.process_job(db, cfg(owner_user_ids=frozenset({"x"})), GRADE_JOB) == "not_owner"
    db.tables["usage"] = [{"user_id": OWNER, "usd": 9, "created_at": "9999-01-01T00:00:00+00:00"}]
    assert pipeline.process_job(db, cfg(), GRADE_JOB) == "budget"
    assert not db.tables["reviews"]


def test_grade_without_ai_fails_cleanly(db, monkeypatch):
    stub_grade(monkeypatch)
    db.tables["jobs"] = [dict(GRADE_JOB, state="running")]
    assert pipeline.process_job(db, cfg(anthropic_key=""), GRADE_JOB) == "ai_off"
    assert db.tables["jobs"][0]["state"] == "failed"


def test_unusable_grade_logs_its_cost(db, monkeypatch):
    def bad(c, **kw):
        err = InsightError("no grade_answer call")
        err.tokens = (100, 10)
        raise err

    monkeypatch.setattr(ai, "grade_answer", bad)
    assert pipeline.process_job(db, cfg(), GRADE_JOB) == "failed"
    assert db.tables["usage"][0]["input_tokens"] == 100


# --- synthesize -------------------------------------------------------------------

@pytest.fixture()
def space_db(db):
    db.tables["spaces"] = [{"id": "mkt", "name": "Marketing", "kind": "topic", "user_id": OWNER, "archived": False}]
    db.tables["saves"] = [
        {"id": f"s{i}", "user_id": OWNER, "space_id": "mkt", "status": "ready",
         "insights": {"title": f"T{i}", "key_idea": f"Idea {i}", "takeaways": ["a", "b"]}}
        for i in range(1, 6)
    ]
    return db


SYNTH_JOB = {"id": "y1", "type": "synthesize", "space_id": "mkt", "user_id": OWNER, "attempts": 1}


def test_synthesis_is_stored_with_real_save_ids(space_db, monkeypatch):
    c = cfg(smart_model="smart")
    seen = {}

    def fake_call(client, **kw):
        seen.update(kw)
        raw = {"topic": "Pricing", "points": ["Anchor high", "Show three tiers"],
               "disagreements": [{"point": "Free trials hurt", "save_refs": ["S2", "S99"]}],
               "suggested_action": "Test a decoy tier on the landing page."}
        return kw["validate"](raw), 2000, 300

    monkeypatch.setattr(ai, "_client", lambda cfg: object())
    monkeypatch.setattr(ai, "call_tool", fake_call)
    space_db.tables["jobs"] = [dict(SYNTH_JOB, state="running")]
    assert pipeline.process_job(space_db, c, SYNTH_JOB) == "synthesized"
    assert seen["model"] == "smart"
    syn = space_db.tables["syntheses"][0]
    assert syn["space_id"] == "mkt" and syn["topic"] == "Pricing"
    assert syn["disagreements"] == [{"point": "Free trials hurt", "save_ids": ["s2"]}]
    assert sorted(syn["source_save_ids"]) == ["s1", "s2", "s3", "s4", "s5"]
    assert space_db.tables["usage"][0]["kind"] == "synthesize"
    assert space_db.tables["usage"][0]["usd"] == pytest.approx(2000 / 1e6 * 3 + 300 / 1e6 * 15)
    assert space_db.tables["jobs"][0]["state"] == "done"


def test_synthesis_needs_enough_saves_and_the_smart_model(space_db, monkeypatch):
    monkeypatch.setattr(ai, "synthesize", lambda *a, **k: pytest.fail("should not call the model"))
    assert pipeline.process_job(space_db, cfg(), SYNTH_JOB) == "ai_off"
    space_db.tables["saves"] = space_db.tables["saves"][:2]
    assert pipeline.process_job(space_db, cfg(smart_model="smart"), SYNTH_JOB) == "too_few"
    assert pipeline.process_job(space_db, cfg(smart_model="smart", owner_user_ids=frozenset({"x"})), SYNTH_JOB) == "not_owner"


# --- the Claude call contract --------------------------------------------------------

class FakeClient:
    """Answers with the queued replies; records the request arguments."""

    def __init__(self, replies):
        self.replies = list(replies)
        self.requests: list[dict] = []
        self.messages = SimpleNamespace(create=self._create)

    def _create(self, **kw):
        self.requests.append(kw)
        content = self.replies.pop(0)
        return SimpleNamespace(content=content, usage=SimpleNamespace(input_tokens=10, output_tokens=5))


def tool_use(name, data):
    return SimpleNamespace(type="tool_use", name=name, input=data)


def text(t):
    return SimpleNamespace(type="text", text=t)


def test_tool_choice_is_never_forced(monkeypatch):
    client = FakeClient([[tool_use("grade_answer", {"verdict": "got", "feedback": "ok"})]])
    value, t_in, t_out = ai.call_tool(client, model="m", system="s", tool=ai.GRADE_TOOL, content="c",
                                      max_tokens=10, validate=normalize_grade)
    assert value["grade"] == 5 and (t_in, t_out) == (10, 5)
    req = client.requests[0]
    assert req["tool_choice"] == {"type": "auto"}
    assert "grade_answer" in req["system"]


def test_a_reply_without_the_tool_is_retried_once():
    client = FakeClient([[text("Sure! The answer is good.")],
                         [tool_use("grade_answer", {"verdict": "partly", "feedback": "ok"})]])
    value, t_in, _ = ai.call_tool(client, model="m", system="s", tool=ai.GRADE_TOOL, content="c",
                                  max_tokens=10, validate=normalize_grade)
    assert value["grade"] == 3 and t_in == 20
    assert "unusable" in client.requests[1]["messages"][0]["content"]


def test_two_unusable_replies_raise_with_their_tokens():
    client = FakeClient([[text("no")], [tool_use("grade_answer", {"verdict": "maybe"})]])
    with pytest.raises(InsightError) as e:
        ai.call_tool(client, model="m", system="s", tool=ai.GRADE_TOOL, content="c", max_tokens=10,
                     validate=normalize_grade)
    assert e.value.tokens == (20, 10)


def test_understand_uses_auto_tool_choice(monkeypatch):
    client = FakeClient([[tool_use("save_insights", {
        "title": "Decoy", "key_idea": "Use a decoy tier.", "takeaways": ["a", "b", "c"], "actions": [],
        "intent": "learn", "tags": ["pricing"], "suggested_space": None, "confidence": 0.2, "cards": []})]])
    monkeypatch.setattr(ai, "_client", lambda c: client)
    u = ai.understand(cfg(), platform="instagram", creator=None, title=None, caption="c", transcript=None,
                      space_names={}, user_note=None)
    assert u.insights["key_idea"] == "Use a decoy tier."
    assert client.requests[0]["tool_choice"] == {"type": "auto"}


# --- rules --------------------------------------------------------------------------

def test_sm2_matches_the_app():
    assert sm2(2.5, 0, 0, 5) == (2.6, 1, 1)
    assert sm2(2.6, 1, 1, 5) == (2.7, 6, 2)
    assert sm2(2.7, 6, 2, 5) == (2.8, 16, 3)  # round(6 × 2.7)
    assert sm2(2.5, 15, 4, 1)[1:] == (1, 0)
    assert sm2(2.5, 0, 0, 3)[0] == 2.36
    assert sm2(1.3, 1, 0, 0)[0] == 1.3


def test_normalize_grade_and_synthesis():
    assert normalize_grade({"verdict": "missed"})["grade"] == 1
    with pytest.raises(InsightError):
        normalize_grade({"verdict": "good"})
    with pytest.raises(InsightError):
        normalize_synthesis({"points": []}, {})
    out = normalize_synthesis({"points": [" One ", ""], "disagreements": [{"point": "x", "save_refs": ["s1"]},
                                                                          {"point": "y", "save_refs": []}]},
                              {"S1": "id-1"})
    assert out["points"] == ["One"]
    assert out["disagreements"] == [{"point": "x", "save_ids": ["id-1"]}]
