"""Transcription (Groq), understanding (Claude) and embeddings (Voyage)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from .config import Config
from .rules import INTENTS, InsightError, claude_cost, normalize_insights


@dataclass
class Transcript:
    segments: list[dict[str, Any]]
    text: str
    language: str | None
    seconds: float


def transcribe(cfg: Config, audio: Path) -> Transcript | None:
    """Timestamped segments. Returns None when no transcription key is set."""
    if not cfg.groq_key:
        return None
    with audio.open("rb") as fh:
        r = httpx.post(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {cfg.groq_key}"},
            data={"model": cfg.groq_model, "response_format": "verbose_json", "temperature": "0"},
            files={"file": (audio.name, fh, "audio/mpeg")},
            timeout=180,
        )
    r.raise_for_status()
    body = r.json()
    segments = [
        {"start": round(float(s.get("start", 0)), 2), "end": round(float(s.get("end", 0)), 2),
         "text": str(s.get("text", "")).strip()}
        for s in body.get("segments") or []
        if str(s.get("text", "")).strip()
    ]
    return Transcript(
        segments=segments,
        text=str(body.get("text") or " ".join(s["text"] for s in segments)).strip(),
        language=body.get("language"),
        seconds=float(body.get("duration") or 0),
    )


SYSTEM = """You read one saved social video (or post) for its owner, a marketing manager in Casablanca, and file what matters.

Rules:
- key_idea: one actionable sentence of 16 words or fewer, in English, whatever the source language.
- takeaways: exactly 3 short bullets, in English.
- actions: only when the video truly contains something to do; otherwise an empty list.
- Never invent facts that are not in the caption, title or transcript. If the transcript is empty or the audio is music only, say so in music_only and rely on the caption.
- places: only real, named venues that are explicitly mentioned (restaurant, café, shop, hotel, gym…). Never guess.
- suggested_space: exactly one of the owner's Space names when one clearly fits, else null. confidence: 0..1 that it belongs there.
- cards: 1 to 3 recall questions whose answers are in the content, to help the owner remember the idea later.
- tags: 3 to 6 lower-case topic tags in English.
- language: ISO 639-1 code of the content (en, fr, ar…; Darija = ar).
Always answer by calling save_insights."""

TOOL = {
    "name": "save_insights",
    "description": "Store the structured reading of the saved video.",
    "input_schema": {
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "Short title, 3 to 8 words."},
            "key_idea": {"type": "string"},
            "takeaways": {"type": "array", "items": {"type": "string"}, "minItems": 1, "maxItems": 3},
            "actions": {"type": "array", "items": {"type": "string"}},
            "intent": {"type": "string", "enum": list(INTENTS)},
            "tags": {"type": "array", "items": {"type": "string"}},
            "language": {"type": "string"},
            "suggested_space": {"type": ["string", "null"]},
            "confidence": {"type": "number"},
            "music_only": {"type": "boolean"},
            "places": {
                "type": "array",
                "items": {"type": "object", "properties": {"name": {"type": "string"}, "address": {"type": "string"}},
                          "required": ["name"]},
            },
            "cards": {
                "type": "array",
                "items": {"type": "object", "properties": {"prompt": {"type": "string"}, "answer": {"type": "string"}},
                          "required": ["prompt", "answer"]},
            },
        },
        "required": ["title", "key_idea", "takeaways", "actions", "intent", "tags", "suggested_space", "confidence", "cards"],
    },
}


@dataclass
class Understanding:
    insights: dict[str, Any]
    input_tokens: int
    output_tokens: int
    usd: float


def understand(
    cfg: Config,
    *,
    platform: str,
    creator: str | None,
    title: str | None,
    caption: str | None,
    transcript: str | None,
    space_names: dict[str, str],
    user_note: str | None,
) -> Understanding:
    """One Claude call; the JSON is validated and asked for once more if unusable."""
    import anthropic  # lazy

    client = anthropic.Anthropic(api_key=cfg.anthropic_key, max_retries=2, timeout=90)
    spaces = ", ".join(sorted({n for n in space_names})) or "(none yet)"
    content = (
        f"Platform: {platform}\nCreator: {creator or 'unknown'}\n"
        f"Owner's Spaces: {spaces}\n"
        f"Owner's note: {user_note or '(none)'}\n\n"
        f"Title: {title or '(none)'}\n\nCaption:\n{(caption or '(none)')[:4000]}\n\n"
        f"Transcript:\n{(transcript or '(empty: no speech or not transcribed)')[:12000]}"
    )
    tokens_in = tokens_out = 0
    last_error: Exception | None = None
    for attempt in range(2):
        messages: list[dict[str, Any]] = [{"role": "user", "content": content}]
        if attempt == 1 and last_error is not None:
            messages[0]["content"] += f"\n\nYour previous answer was unusable ({last_error}). Call save_insights again with every required field."
        msg = client.messages.create(
            model=cfg.fast_model,
            max_tokens=1200,
            system=SYSTEM,
            tools=[TOOL],
            tool_choice={"type": "tool", "name": "save_insights"},
            messages=messages,
        )
        tokens_in += msg.usage.input_tokens
        tokens_out += msg.usage.output_tokens
        block = next((b for b in msg.content if getattr(b, "type", "") == "tool_use"), None)
        try:
            insights = normalize_insights(getattr(block, "input", None), space_names)
            return Understanding(insights, tokens_in, tokens_out,
                                 claude_cost(tokens_in, tokens_out, cfg.fast_usd_in, cfg.fast_usd_out))
        except InsightError as exc:
            last_error = exc
    raise InsightError(str(last_error))


@dataclass
class Embedding:
    vector: list[float]
    tokens: int


def embed(cfg: Config, text: str, input_type: str = "document") -> Embedding | None:
    if not cfg.voyage_key or not text.strip():
        return None
    r = httpx.post(
        "https://api.voyageai.com/v1/embeddings",
        headers={"Authorization": f"Bearer {cfg.voyage_key}"},
        json={"input": [text[:30000]], "model": cfg.voyage_model, "input_type": input_type, "output_dimension": 1024},
        timeout=60,
    )
    r.raise_for_status()
    body = r.json()
    return Embedding(vector=body["data"][0]["embedding"], tokens=int(body.get("usage", {}).get("total_tokens", 0)))
