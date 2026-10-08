"""Pure rules with no network or I/O, so they're easy to test."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

FILING_THRESHOLD = 0.75
INTENTS = ("learn", "try", "visit", "buy", "inspire", "fun")
KEY_IDEA_MAX_WORDS = 16


def detect_platform(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    if host.endswith("instagram.com") or host == "instagr.am":
        return "instagram"
    if host.endswith("tiktok.com"):
        return "tiktok"
    if host.endswith("youtube.com") or host == "youtu.be":
        return "youtube"
    return "web"


def choose_space(
    picked_space_id: str | None,
    suggested_space_id: str | None,
    confidence: float | None,
    inbox_space_id: str | None,
) -> str | None:
    """Spec step 5: keep my pick; else the suggestion when confident; else Inbox."""
    if picked_space_id:
        return picked_space_id
    if suggested_space_id and confidence is not None and confidence >= FILING_THRESHOLD:
        return suggested_space_id
    return inbox_space_id


def _clean_text(value: Any, limit: int) -> str:
    if not isinstance(value, str):
        return ""
    return re.sub(r"\s+", " ", value).strip()[:limit]


def _trim_words(text: str, max_words: int) -> str:
    words = text.split()
    if len(words) <= max_words:
        return text
    return " ".join(words[:max_words]).rstrip(",;:") + "…"


class InsightError(ValueError):
    """The model's answer doesn't match the schema."""


def normalize_insights(raw: Any, space_names: dict[str, str]) -> dict[str, Any]:
    """Validates and cleans the model's JSON. Raises InsightError when unusable.

    space_names maps a lower-cased Space name to its id.
    """
    if not isinstance(raw, dict):
        raise InsightError("not an object")

    key_idea = _clean_text(raw.get("key_idea"), 300)
    if not key_idea:
        raise InsightError("key_idea missing")
    key_idea = _trim_words(key_idea, KEY_IDEA_MAX_WORDS)

    takeaways = [t for t in (_clean_text(x, 240) for x in raw.get("takeaways") or []) if t]
    if len(takeaways) < 1:
        raise InsightError("takeaways missing")
    takeaways = takeaways[:3]

    actions = [a for a in (_clean_text(x, 200) for x in raw.get("actions") or []) if a][:5]

    intent = raw.get("intent")
    if intent not in INTENTS:
        intent = "learn"

    tags = []
    for t in raw.get("tags") or []:
        t = _clean_text(t, 40).lower().lstrip("#")
        if t and t not in tags:
            tags.append(t)
    tags = tags[:8]

    try:
        confidence = float(raw.get("confidence"))
    except (TypeError, ValueError):
        confidence = 0.0
    confidence = max(0.0, min(1.0, confidence))

    suggested = _clean_text(raw.get("suggested_space"), 80).lower()
    suggested_id = space_names.get(suggested) if suggested else None
    if suggested_id is None:
        confidence = min(confidence, 0.5)  # nothing to file into

    places = []
    for p in raw.get("places") or []:
        if isinstance(p, dict):
            name = _clean_text(p.get("name"), 120)
            if name:
                places.append({"name": name, "address": _clean_text(p.get("address"), 200) or None})
    places = places[:5]

    cards = []
    for c in raw.get("cards") or []:
        if isinstance(c, dict):
            prompt, answer = _clean_text(c.get("prompt"), 240), _clean_text(c.get("answer"), 400)
            if prompt and answer:
                cards.append({"prompt": prompt, "answer": answer})
    cards = cards[:3]

    return {
        "title": _clean_text(raw.get("title"), 120) or _trim_words(key_idea, 8),
        "key_idea": key_idea,
        "takeaways": takeaways,
        "actions": actions,
        "intent": intent,
        "tags": tags,
        "language": _clean_text(raw.get("language"), 10).lower() or None,
        "suggested_space_id": suggested_id,
        "confidence": confidence,
        "places": places,
        "cards": cards,
    }


def claude_cost(input_tokens: int, output_tokens: int, usd_in: float, usd_out: float) -> float:
    return round(input_tokens / 1e6 * usd_in + output_tokens / 1e6 * usd_out, 6)


def is_owner(user_id: str, owners: frozenset[str]) -> bool:
    return bool(owners) and user_id in owners


def scale_filter() -> str:
    """ffmpeg filter: the short side becomes 720 px (never upscales), even dimensions."""
    return (
        "scale='if(gt(iw,ih),-2,min(720,iw))':'if(gt(iw,ih),min(720,ih),-2)'"
        ":force_divisible_by=2"
    )


def embedding_text(insights: dict[str, Any], caption: str | None, transcript: str | None) -> str:
    parts = [insights.get("title") or "", insights.get("key_idea") or ""]
    parts += insights.get("takeaways") or []
    parts.append(" ".join(insights.get("tags") or []))
    if caption:
        parts.append(caption[:1500])
    if transcript:
        parts.append(transcript[:6000])
    return "\n".join(p for p in parts if p)


def segments_text(segments: list[dict[str, Any]]) -> str:
    return " ".join(str(s.get("text", "")).strip() for s in segments if s.get("text")).strip()
