"""The provider seam: Gemini, Claude and Groq over plain HTTPS, the one-retry rule, and how the
run's settings choose between them. No network: every request is answered from a queue."""

from __future__ import annotations

import base64
import json

import pytest

from stash_worker import ai, providers
from stash_worker.config import Config
from stash_worker.providers import Claude, Gemini, Groq, Media, ProviderError, gemini_schema, parse_json_text
from stash_worker.rules import InsightError, normalize_grade

from fakes import FakeHttp, FakeProvider, Resp
from test_pipeline import cfg

SECRET = "sk-very-secret-key-123"
nosleep = lambda s: None  # noqa: E731


def gemini_answer(obj, tokens=(100, 20, 7)):
    return Resp(200, {"candidates": [{"content": {"parts": [{"text": "thinking…", "thought": True},
                                                            {"text": json.dumps(obj)}]}, "finishReason": "STOP"}],
                      "usageMetadata": {"promptTokenCount": tokens[0], "candidatesTokenCount": tokens[1],
                                        "thoughtsTokenCount": tokens[2]}})


# --- Gemini ---------------------------------------------------------------------------------

def test_gemini_structured_call_shape():
    http = FakeHttp([gemini_answer({"verdict": "got", "feedback": "ok"})])
    raw, t_in, t_out = Gemini(SECRET, http, nosleep).structured(
        model="fast-model-id", system="sys", tool=ai.GRADE_TOOL, content="hello", images=[(b"img", "image/png")])
    assert raw == {"verdict": "got", "feedback": "ok"} and (t_in, t_out) == (100, 27)  # thinking tokens are billed
    req = http.requests[0]
    assert req["url"].endswith("/v1beta/models/fast-model-id:generateContent")
    assert SECRET not in req["url"] and req["headers"]["x-goog-api-key"] == SECRET  # the key rides in a header
    body = req["json"]
    assert body["system_instruction"]["parts"][0]["text"] == "sys"
    parts = body["contents"][0]["parts"]
    assert parts[0]["inline_data"] == {"mime_type": "image/png", "data": base64.b64encode(b"img").decode()}
    assert parts[-1] == {"text": "hello"}
    gen = body["generationConfig"]
    assert gen["responseMimeType"] == "application/json" and gen["responseSchema"]["required"] == ["verdict", "feedback"]


def test_gemini_schema_drops_what_gemini_rejects():
    s = gemini_schema(ai.SCREENSHOT_TOOL["input_schema"])
    assert s["properties"]["suggested_space"] == {"type": "string", "nullable": True}
    assert s["properties"]["creator"]["nullable"] is True
    assert s["properties"]["takeaways"]["maxItems"] == 3
    assert "additionalProperties" not in json.dumps(s) and s["propertyOrdering"][0] == "title"


def test_gemini_sends_a_small_video_inline_and_a_big_one_through_the_files_api(tmp_path, monkeypatch):
    clip = tmp_path / "v.mp4"
    clip.write_bytes(b"0123456789")
    http = FakeHttp([gemini_answer({"language": "en", "segments": [], "visual": ""})])
    Gemini(SECRET, http, nosleep).structured(model="m", system="s", tool=ai.TRANSCRIBE_TOOL, content="c",
                                            media=[Media(mime="video/mp4", path=clip)])
    body = http.requests[0]["json"]
    assert body["contents"][0]["parts"][0]["inline_data"]["mime_type"] == "video/mp4"
    assert body["generationConfig"]["mediaResolution"] == "MEDIA_RESOLUTION_LOW"

    monkeypatch.setattr(providers, "INLINE_MAX", 4)
    http = FakeHttp([
        Resp(200, {}, headers={"x-goog-upload-url": "https://upload.example/session"}),
        Resp(200, {"file": {"name": "files/abc", "uri": "https://files/abc", "state": "PROCESSING"}}),
        Resp(200, {"name": "files/abc", "uri": "https://files/abc", "state": "ACTIVE"}),
        gemini_answer({"language": "en", "segments": [], "visual": ""}),
        Resp(200, {}),
    ])
    Gemini(SECRET, http, nosleep).structured(model="m", system="s", tool=ai.TRANSCRIBE_TOOL, content="c",
                                            media=[Media(mime="video/mp4", path=clip)])
    start, upload, poll, generate, forget = http.requests
    assert start["headers"]["X-Goog-Upload-Command"] == "start" and start["headers"]["X-Goog-Upload-Header-Content-Length"] == "10"
    assert upload["url"] == "https://upload.example/session" and upload["content"] == b"0123456789"
    assert poll["method"] == "GET" and poll["url"].endswith("/v1beta/files/abc")
    assert generate["json"]["contents"][0]["parts"][0] == {"file_data": {"file_uri": "https://files/abc", "mime_type": "video/mp4"}}
    assert forget["method"] == "DELETE"  # the upload is removed afterwards


def test_gemini_retries_a_busy_answer_and_falls_back_when_the_schema_is_refused():
    http = FakeHttp([Resp(503), gemini_answer({"verdict": "got", "feedback": ""})])
    assert Gemini(SECRET, http, nosleep).structured(model="m", system="s", tool=ai.GRADE_TOOL, content="c")[0]["verdict"] == "got"

    http = FakeHttp([Resp(400), gemini_answer({"verdict": "missed", "feedback": ""})])
    Gemini(SECRET, http, nosleep).structured(model="m", system="s", tool=ai.GRADE_TOOL, content="c")
    again = http.requests[1]["json"]
    assert "responseSchema" not in again["generationConfig"] and "JSON Schema" in again["system_instruction"]["parts"][0]["text"]


def test_gemini_errors_never_carry_the_key():
    http = FakeHttp([Resp(429), Resp(429), Resp(429)])
    with pytest.raises(ProviderError) as e:
        Gemini(SECRET, http, nosleep).structured(model="m", system="s", tool=ai.GRADE_TOOL, content="c")
    assert e.value.status == 429 and SECRET not in str(e.value) and SECRET not in repr(e.value)

    blocked = Resp(200, {"candidates": [{"finishReason": "SAFETY"}], "usageMetadata": {"promptTokenCount": 9}})
    with pytest.raises(InsightError) as e2:
        Gemini(SECRET, FakeHttp([blocked]), nosleep).structured(model="m", system="s", tool=ai.GRADE_TOOL, content="c")
    assert e2.value.tokens == (9, 0)


def test_json_text_tolerates_fences_and_prose():
    assert parse_json_text('```json\n{"a": 1}\n```') == {"a": 1}
    assert parse_json_text('Here you go: {"a": 2} hope it helps') == {"a": 2}
    with pytest.raises(InsightError):
        parse_json_text("no json here")


# --- Claude ---------------------------------------------------------------------------------

def claude_answer(blocks):
    return Resp(200, {"content": blocks, "usage": {"input_tokens": 10, "output_tokens": 5}})


def test_claude_tool_choice_is_never_forced():
    http = FakeHttp([claude_answer([{"type": "tool_use", "name": "grade_answer", "input": {"verdict": "got", "feedback": "ok"}}])])
    raw, t_in, t_out = Claude(SECRET, http, nosleep).structured(model="m", system="s", tool=ai.GRADE_TOOL, content="c")
    assert raw["verdict"] == "got" and (t_in, t_out) == (10, 5)
    req = http.requests[0]
    assert req["json"]["tool_choice"] == {"type": "auto"} and "grade_answer" in req["json"]["system"]
    assert req["headers"]["x-api-key"] == SECRET and req["json"]["model"] == "m"


def test_a_reply_without_the_tool_is_retried_once_then_raises_with_its_tokens():
    http = FakeHttp([claude_answer([{"type": "text", "text": "Sure! It is good."}]),
                     claude_answer([{"type": "tool_use", "name": "grade_answer", "input": {"verdict": "partly", "feedback": "ok"}}])])
    value, t_in, _ = ai.call_structured(Claude(SECRET, http, nosleep), model="m", system="s", tool=ai.GRADE_TOOL,
                                        content="c", max_tokens=10, validate=normalize_grade)
    assert value["grade"] == 3 and t_in == 20
    assert "unusable" in http.requests[1]["json"]["messages"][0]["content"][-1]["text"]

    http = FakeHttp([claude_answer([{"type": "text", "text": "no"}]),
                     claude_answer([{"type": "tool_use", "name": "grade_answer", "input": {"verdict": "maybe"}}])])
    with pytest.raises(InsightError) as e:
        ai.call_structured(Claude(SECRET, http, nosleep), model="m", system="s", tool=ai.GRADE_TOOL, content="c",
                           max_tokens=10, validate=normalize_grade)
    assert e.value.tokens == (20, 10)


# --- Groq -----------------------------------------------------------------------------------

def test_groq_gets_the_file_itself(tmp_path):
    clip = tmp_path / "video.mp4"
    clip.write_bytes(b"mp4bytes")
    http = FakeHttp([Resp(200, {"segments": [{"start": 0, "end": 1.5, "text": " hello "}], "language": "en",
                                "text": "hello", "duration": 1.5})])
    out = Groq(SECRET, http, nosleep).transcribe(model="transcribe-id", path=clip, mime="video/mp4")
    assert out["seconds"] == 1.5 and http.requests[0]["data"]["model"] == "transcribe-id"
    assert http.requests[0]["files"]["file"] == ("video.mp4", b"mp4bytes", "video/mp4")


# --- Choosing a provider ----------------------------------------------------------------------

def test_a_provider_needs_its_key_and_its_model_id():
    wc = {"owner_ids": ["A-1"], "keys": {"gemini": "g", "groq": None, "anthropic": "a"},
          "instagram_cookies_b64": None, "config": {"ai_provider": "auto", "claude_fast_model": "c-fast"}}
    c = Config.from_worker_config(wc, "https://x.supabase.co/")
    assert c.supabase_url == "https://x.supabase.co" and c.owner_user_ids == frozenset({"a-1"})
    assert c.ai_provider == "claude"            # gemini has a key but no model id
    assert c.transcribe_provider is None        # claude cannot transcribe
    c = Config.from_worker_config({**wc, "config": {"gemini_fast_model": "g-fast", "claude_fast_model": "c-fast"}})
    assert c.ai_provider == "gemini" and c.transcribe_provider == "gemini"
    assert c.model("gemini", "smart") == "g-fast"   # smart falls back to fast
    c = Config.from_worker_config({**wc, "config": {"gemini_fast_model": "g-fast", "ai_provider": "claude"}})
    assert c.ai_provider is None                # asked for claude, which has no model id
    assert Config.from_worker_config({**wc, "config": {"gemini_fast_model": "g", "ai_provider": "none"}}).ai_provider is None
    assert Config().ai_provider is None and not Config().has_ai


def test_keys_are_not_in_the_configs_repr():
    c = cfg(gemini_key=SECRET, anthropic_key=SECRET, groq_key=SECRET, ig_cookies_b64=SECRET, anon_key=SECRET)
    assert SECRET not in repr(c) and SECRET not in str(c)


def test_structured_uses_the_configured_model_and_price(monkeypatch):
    fake = FakeProvider([{"verdict": "got", "feedback": "ok"}], tokens=(1_000_000, 100_000))
    monkeypatch.setattr(providers, "make", lambda name, c: fake)
    c = cfg(anthropic_key="", gemini_key="k", values={"gemini_fast_model": "g-fast", "gemini_smart_model": "g-smart",
                                                    "price_gemini_smart_in": "2", "price_gemini_smart_out": "10"})
    g = ai.grade_answer(c, question="q", expected="e", key_idea=None, answer="a")
    assert fake.calls[0]["model"] == "g-fast" and g.usd == 0 and g.provider == "gemini"  # no price row = free
    fake.answers.append({"topic": "t", "points": ["p"], "disagreements": [], "suggested_action": "a"})
    s = ai.synthesize(c, space_name="Marketing", saves=[{"id": "s1", "key_idea": "k"}])
    assert fake.calls[1]["model"] == "g-smart" and s.usd == pytest.approx(3.0)


def test_no_provider_is_an_error_the_pipeline_understands():
    with pytest.raises(ai.NoProvider):
        ai.grade_answer(cfg(anthropic_key=""), question="q", expected="e", key_idea=None, answer="a")


def test_transcribe_through_gemini_and_groq(tmp_path, monkeypatch):
    clip = tmp_path / "v.mp4"
    clip.write_bytes(b"x")
    fake = FakeProvider([{"language": "FR", "visual": "A café counter.", "segments": [
        {"start": 0, "end": 2.5, "text": " Bonjour "}, {"start": 2.5, "end": 4, "text": ""}, {"start": 4, "end": 6, "text": "ça va"}]}])
    monkeypatch.setattr(providers, "make", lambda name, c: fake)
    tr = ai.transcribe(cfg(anthropic_key="", groq_key="", gemini_key="k", values={"gemini_fast_model": "g"}), clip)
    assert tr.provider == "gemini" and tr.language == "fr" and tr.text == "Bonjour ça va" and tr.seconds == 6
    assert tr.visual == "A café counter." and fake.calls[0]["media"][0].path == clip

    class G:
        def transcribe(self, **kw):
            return {"segments": [{"start": 0, "end": 3, "text": "hi"}], "language": "en", "seconds": 3.0}

    monkeypatch.setattr(providers, "make", lambda name, c: G())
    tr = ai.transcribe(cfg(values={"price_groq_audio_hour": "3600"}), clip)
    assert tr.provider == "groq" and tr.usd == pytest.approx(3.0)
    assert ai.transcribe(cfg(groq_key=""), clip) is None


def test_ask_maps_labels_back_and_drops_unknown_citations(monkeypatch):
    fake = FakeProvider([{"answer": "Use a decoy tier.", "cited": ["S2", "S9", "not-an-id", "id-1"]}])
    monkeypatch.setattr(providers, "make", lambda name, c: fake)
    a = ai.ask(cfg(), question="How do I price?", context=[
        {"save_id": "id-1", "title": "A", "key_idea": "k", "takeaways": ["t"], "caption": "c", "excerpt": "e"},
        {"save_id": "id-2", "title": "B"}])
    assert a.cited == ["id-2", "id-1"] and "S1 · A" in fake.calls[0]["content"]
