import pytest

from stash_worker.rules import (
    InsightError,
    choose_space,
    claude_cost,
    detect_platform,
    embedding_text,
    is_owner,
    normalize_insights,
    scale_filter,
    segments_text,
)

SPACES = {"marketing": "s-mkt", "food": "s-food"}


def good(**over):
    base = {
        "title": "Decoy pricing",
        "key_idea": "Add a decoy tier so the middle option feels like the deal.",
        "takeaways": ["One", "Two", "Three"],
        "actions": [],
        "intent": "learn",
        "tags": ["Pricing", "#psychology", "pricing"],
        "language": "EN",
        "suggested_space": "Marketing",
        "confidence": 0.9,
        "places": [{"name": "Café Bacha", "address": "Casablanca"}, {"name": ""}],
        "cards": [{"prompt": "What does a decoy do?", "answer": "Makes the middle look cheap."}],
    }
    base.update(over)
    return base


@pytest.mark.parametrize(
    "url,platform",
    [
        ("https://www.instagram.com/reel/abc/", "instagram"),
        ("https://instagr.am/p/abc", "instagram"),
        ("https://vm.tiktok.com/xyz/", "tiktok"),
        ("https://www.tiktok.com/@a/video/1", "tiktok"),
        ("https://youtu.be/abc", "youtube"),
        ("https://m.youtube.com/shorts/abc", "youtube"),
        ("https://example.com/post", "web"),
        ("not a url", "web"),
    ],
)
def test_detect_platform(url, platform):
    assert detect_platform(url) == platform


def test_filing_keeps_my_pick():
    assert choose_space("mine", "ai", 0.99, "inbox") == "mine"


def test_filing_uses_confident_suggestion():
    assert choose_space(None, "ai", 0.75, "inbox") == "ai"


def test_filing_falls_back_to_inbox():
    assert choose_space(None, "ai", 0.74, "inbox") == "inbox"
    assert choose_space(None, None, 0.99, "inbox") == "inbox"
    assert choose_space(None, "ai", None, "inbox") == "inbox"


def test_normalize_happy_path():
    out = normalize_insights(good(), SPACES)
    assert out["suggested_space_id"] == "s-mkt"
    assert out["confidence"] == 0.9
    assert out["tags"] == ["pricing", "psychology"]
    assert out["language"] == "en"
    assert out["places"] == [{"name": "Café Bacha", "address": "Casablanca"}]
    assert len(out["cards"]) == 1


def test_key_idea_trimmed_to_16_words():
    long = " ".join(f"w{i}" for i in range(30))
    out = normalize_insights(good(key_idea=long), SPACES)
    assert len(out["key_idea"].rstrip("…").split()) == 16


def test_unknown_space_caps_confidence():
    out = normalize_insights(good(suggested_space="Gardening", confidence=0.99), SPACES)
    assert out["suggested_space_id"] is None
    assert out["confidence"] <= 0.5


def test_bad_intent_defaults_to_learn():
    assert normalize_insights(good(intent="party"), SPACES)["intent"] == "learn"


def test_takeaways_capped_at_three():
    out = normalize_insights(good(takeaways=["a", "b", "c", "d"]), SPACES)
    assert out["takeaways"] == ["a", "b", "c"]


@pytest.mark.parametrize("raw", [None, "text", {"takeaways": ["a"]}, good(key_idea=""), good(takeaways=[])])
def test_unusable_answers_raise(raw):
    with pytest.raises(InsightError):
        normalize_insights(raw, SPACES)


def test_confidence_is_clamped():
    assert normalize_insights(good(confidence=7), SPACES)["confidence"] == 1.0
    assert normalize_insights(good(confidence="x"), SPACES)["confidence"] == 0.0


def test_owner_gate():
    assert is_owner("a", frozenset({"a"}))
    assert not is_owner("b", frozenset({"a"}))
    assert not is_owner("a", frozenset())


def test_cost():
    assert claude_cost(1_000_000, 200_000, 1.0, 5.0) == pytest.approx(2.0)


def test_scale_filter_short_side_720():
    f = scale_filter()
    assert "720" in f and "force_divisible_by=2" in f


def test_embedding_text_includes_parts():
    text = embedding_text({"title": "T", "key_idea": "K", "takeaways": ["A"], "tags": ["x"]}, "cap", "said")
    for part in ("T", "K", "A", "x", "cap", "said"):
        assert part in text


def test_segments_text():
    assert segments_text([{"text": " hi "}, {"text": ""}, {"text": "there"}]) == "hi there"
