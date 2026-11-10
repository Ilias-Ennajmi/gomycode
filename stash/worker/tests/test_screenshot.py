"""Screenshots shared to Stash: Claude vision reads the image, then the usual filing and embedding."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from stash_worker import ai, geocode, media, pipeline
from stash_worker.rules import InsightError, normalize_screenshot, screenshot_path

from test_pipeline import OWNER, FakeSupa, cfg

CLIENT_ID = "0f8fad5b-d9cb-469f-a165-70867728950e"


class ShotSupa(FakeSupa):
    def __init__(self):
        super().__init__()
        self.files: dict[str, bytes] = {}

    def download(self, bucket, path):
        key = f"{bucket}/{path}"
        if key not in self.files:
            raise RuntimeError("404")
        return self.files[key]


@pytest.fixture()
def db():
    d = ShotSupa()
    d.tables["spaces"] = [
        {"id": "inbox", "name": "Inbox", "kind": "inbox", "user_id": OWNER, "archived": False},
        {"id": "food", "name": "Food spots", "kind": "topic", "user_id": OWNER, "archived": False},
    ]
    d.tables["settings"] = [{"user_id": OWNER, "monthly_budget_usd": 5}]
    d.tables["saves"] = [{"id": "s1", "user_id": OWNER, "source_url": f"screenshot:{CLIENT_ID}.jpg",
                          "platform": "screenshot", "space_id": None, "status": "queued"}]
    d.files[f"stash-thumbs/{OWNER}/screenshots/{CLIENT_ID}.jpg"] = b"\xff\xd8jpeg"
    return d


JOB = {"id": "j1", "type": "ingest", "save_id": "s1", "user_id": OWNER, "attempts": 1}

VISION = {
    "title": "Best msemen in Maarif", "key_idea": "Try the msemen at Café Lune on a weekend morning.",
    "takeaways": ["a", "b", "c"], "actions": [], "intent": "visit", "tags": ["food", "casablanca"],
    "language": "fr", "suggested_space": "Food spots", "confidence": 0.92,
    "places": [{"name": "Café Lune", "address": "Maarif, Casablanca"}], "cards": [{"prompt": "q", "answer": "a"}],
    "creator": "casa.eats", "caption_text": "Le meilleur msemen de Casa 🔥", "what_it_is": "café review reel",
    "visible_url": None,
}


def stub(monkeypatch, calls):
    def fake_client(c):
        def create(**kw):
            calls.append(kw)
            return SimpleNamespace(usage=SimpleNamespace(input_tokens=1500, output_tokens=300),
                                   content=[SimpleNamespace(type="tool_use", name="save_insights", input=VISION)])
        return SimpleNamespace(messages=SimpleNamespace(create=create))

    monkeypatch.setattr(ai, "_client", fake_client)
    monkeypatch.setattr(ai, "understand", lambda *a, **k: pytest.fail("a screenshot never takes the video path"))
    monkeypatch.setattr(media, "download", lambda *a, **k: pytest.fail("no yt-dlp for screenshots"))
    monkeypatch.setattr(media, "page_metadata", lambda *a, **k: pytest.fail("no page fetch for screenshots"))
    monkeypatch.setattr(geocode, "geocode_save", lambda supa, c, save_id, geocoder=None: 0)
    monkeypatch.setattr(ai, "embed", lambda c, text, input_type="document": ai.Embedding([0.1] * 1024, 50))


def test_screenshot_is_read_filed_and_embedded(db, monkeypatch):
    calls: list = []
    stub(monkeypatch, calls)
    db.tables["jobs"] = [dict(JOB, state="running")]
    assert pipeline.process_job(db, cfg(), JOB) == "ready"

    # One vision call with the image as a base64 block.
    assert len(calls) == 1
    blocks = calls[0]["messages"][0]["content"]
    assert blocks[0]["type"] == "image" and blocks[0]["source"]["media_type"] == "image/jpeg"
    assert calls[0]["tool_choice"] == {"type": "auto"}

    save = db.tables["saves"][0]
    assert save["status"] == "ready"
    assert save["space_id"] == "food"  # confidence 0.92 ≥ 0.75 → filed into the right Space
    assert save["thumb_path"] == f"{OWNER}/screenshots/{CLIENT_ID}.jpg"
    assert save["creator_handle"] == "@casa.eats"
    assert save["caption"].startswith("Le meilleur msemen")
    assert save["title"] == "café review reel"
    assert db.tables["insights"][0]["key_idea"].startswith("Try the msemen")
    assert len(db.tables["places"]) == 1 and len(db.tables["cards"]) == 1 and len(db.tables["embeddings"]) == 1
    assert [u["kind"] for u in db.tables["usage"]] == ["understand", "embed"]
    assert not db.tables["transcripts"]


def test_low_confidence_screenshot_goes_to_inbox(db, monkeypatch):
    calls: list = []
    stub(monkeypatch, calls)
    VISION_LOW = dict(VISION, confidence=0.4)
    monkeypatch.setattr(ai, "read_screenshot", lambda c, **kw: ai.Understanding(
        normalize_screenshot(VISION_LOW, kw["space_names"]), 10, 10, 0.0))
    assert pipeline.process_job(db, cfg(), JOB) == "ready"
    assert db.tables["saves"][0]["space_id"] == "inbox"


def test_missing_upload_fails_without_retrying(db, monkeypatch):
    stub(monkeypatch, [])
    db.files.clear()
    db.tables["jobs"] = [dict(JOB, state="running")]
    assert pipeline.process_job(db, cfg(), JOB) == "failed"
    assert db.tables["jobs"][0]["state"] == "failed"
    assert db.tables["saves"][0]["status"] == "failed" and "again" in db.tables["saves"][0]["error"]


def test_a_bad_reference_never_reads_another_users_files(db, monkeypatch):
    stub(monkeypatch, [])
    db.tables["saves"][0]["source_url"] = "screenshot:../u-other/screenshots/x.jpg"
    assert pipeline.process_job(db, cfg(), JOB) == "failed"


def test_screenshot_path():
    assert screenshot_path(f"screenshot:{CLIENT_ID}.jpg", "u1") == f"u1/screenshots/{CLIENT_ID}.jpg"
    assert screenshot_path(f"screenshot:{CLIENT_ID}.PNG", "u1") == f"u1/screenshots/{CLIENT_ID}.png"
    for bad in ["screenshot:../x.jpg", "screenshot:abc.jpg", f"screenshot:{CLIENT_ID}.gif", "https://x", None]:
        assert screenshot_path(bad, "u1") is None


def test_normalize_screenshot_extras():
    out = normalize_screenshot(dict(VISION, creator="Casa Eats", visible_url="instagram.com/casa"), {"food spots": "food"})
    assert out["creator"] == "Casa Eats" and out["visible_url"] is None
    assert out["suggested_space_id"] == "food" and out["caption_text"].startswith("Le meilleur")
    out = normalize_screenshot(dict(VISION, visible_url="https://instagram.com/p/x"), {})
    assert out["visible_url"] == "https://instagram.com/p/x" and out["suggested_space_id"] is None
    with pytest.raises(InsightError):
        normalize_screenshot({"creator": "x"}, {})


def test_unusable_vision_answer_is_asked_once_more(db, monkeypatch):
    calls: list = []

    def fake_client(c):
        def create(**kw):
            calls.append(kw)
            content = [] if len(calls) == 1 else [SimpleNamespace(type="tool_use", name="save_insights", input=VISION)]
            return SimpleNamespace(usage=SimpleNamespace(input_tokens=100, output_tokens=10), content=content)
        return SimpleNamespace(messages=SimpleNamespace(create=create))

    stub(monkeypatch, [])
    monkeypatch.setattr(ai, "_client", fake_client)
    assert pipeline.process_job(db, cfg(), JOB) == "ready"
    assert len(calls) == 2
    retry_blocks = calls[1]["messages"][0]["content"]
    assert retry_blocks[0]["type"] == "image" and "unusable" in retry_blocks[-1]["text"]
