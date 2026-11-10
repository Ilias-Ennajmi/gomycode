"""Transcription (Groq), understanding (Claude) and embeddings (Voyage)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, TypeVar

import httpx

from .config import Config
from .rules import (INTENTS, InsightError, claude_cost, normalize_grade, normalize_insights, normalize_screenshot,
                    normalize_synthesis)

T = TypeVar("T")


@dataclass
class Transcript:
    segments: list[dict[str, Any]]
    text: str
    language: str | None
    seconds: float


def transcribe(cfg: Config, audio: Path, mime: str = "audio/mpeg") -> Transcript | None:
    """Timestamped segments. Returns None when no transcription key is set."""
    if not cfg.groq_key:
        return None
    with audio.open("rb") as fh:
        r = httpx.post(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {cfg.groq_key}"},
            data={"model": cfg.groq_model, "response_format": "verbose_json", "temperature": "0"},
            files={"file": (audio.name, fh, mime)},
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
Always answer by calling the save_insights tool."""

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
    client = _client(cfg)
    spaces = ", ".join(sorted({n for n in space_names})) or "(none yet)"
    content = (
        f"Platform: {platform}\nCreator: {creator or 'unknown'}\n"
        f"Owner's Spaces: {spaces}\n"
        f"Owner's note: {user_note or '(none)'}\n\n"
        f"Title: {title or '(none)'}\n\nCaption:\n{(caption or '(none)')[:4000]}\n\n"
        f"Transcript:\n{(transcript or '(empty: no speech or not transcribed)')[:12000]}"
    )
    insights, tokens_in, tokens_out = call_tool(
        client, model=cfg.fast_model, system=SYSTEM, tool=TOOL, content=content, max_tokens=1200,
        validate=lambda raw: normalize_insights(raw, space_names),
    )
    return Understanding(insights, tokens_in, tokens_out,
                         claude_cost(tokens_in, tokens_out, cfg.fast_usd_in, cfg.fast_usd_out))


SCREENSHOT_SYSTEM = SYSTEM.replace(
    "You read one saved social video (or post)",
    "You read one screenshot of a social post (Instagram, TikTok or similar) that the owner shared to save it",
) + """
This is an image, not a video: read everything visible in it.
- creator: the account handle or name shown (with @ when it is a handle), else null.
- caption_text: the post's caption and any on-screen text, transcribed as written (original language), else empty.
- what_it_is: one short phrase saying what the post shows (e.g. "recipe reel", "pricing carousel", "café review").
- visible_url: a link printed in the image, else null.
- places: only when a real, named venue is visible or written. Never invent facts that are not in the image."""

SCREENSHOT_TOOL = {
    **TOOL,
    "input_schema": {
        **TOOL["input_schema"],
        "properties": {
            **TOOL["input_schema"]["properties"],
            "creator": {"type": ["string", "null"]},
            "caption_text": {"type": "string"},
            "what_it_is": {"type": "string"},
            "visible_url": {"type": ["string", "null"]},
        },
    },
}


def read_screenshot(
    cfg: Config,
    *,
    image: bytes,
    media_type: str,
    space_names: dict[str, str],
    user_note: str | None,
) -> Understanding:
    """Claude vision on a shared screenshot: the same insights as a video, plus who posted it and its text."""
    import base64

    spaces = ", ".join(sorted({n for n in space_names})) or "(none yet)"
    content = [
        {"type": "image", "source": {"type": "base64", "media_type": media_type,
                                     "data": base64.b64encode(image).decode("ascii")}},
        {"type": "text", "text": f"Owner's Spaces: {spaces}\nOwner's note: {user_note or '(none)'}\n\n"
                                 "Read this screenshot and call save_insights."},
    ]
    insights, tokens_in, tokens_out = call_tool(
        _client(cfg), model=cfg.fast_model, system=SCREENSHOT_SYSTEM, tool=SCREENSHOT_TOOL, content=content,
        max_tokens=1500, validate=lambda raw: normalize_screenshot(raw, space_names),
    )
    return Understanding(insights, tokens_in, tokens_out,
                         claude_cost(tokens_in, tokens_out, cfg.fast_usd_in, cfg.fast_usd_out))


def call_tool(
    client: Any,
    *,
    model: str,
    system: str,
    tool: dict[str, Any],
    content: str | list[dict[str, Any]],
    max_tokens: int,
    validate: Callable[[Any], T],
) -> tuple[T, int, int]:
    """One Claude call that must answer through `tool`; validated, and asked once more if unusable.

    tool_choice stays "auto": some models reject a forced tool choice. The system prompt asks
    for the tool, and an answer without a tool_use block counts as invalid JSON (one retry).
    Returns (validated value, input tokens, output tokens) summed over both attempts.
    """
    name = tool["name"]
    tokens_in = tokens_out = 0
    last_error: Exception | None = None
    for attempt in range(2):
        retry_note = (f"Your previous answer was unusable ({last_error}). Call {name} again with every required field."
                      if attempt == 1 and last_error is not None else None)
        text: Any
        if isinstance(content, str):
            text = content + (f"\n\n{retry_note}" if retry_note else "")
        else:  # content blocks (an image and its instructions, for vision)
            text = list(content) + ([{"type": "text", "text": retry_note}] if retry_note else [])
        msg = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=f"{system}\n\nAnswer only by calling the {name} tool, exactly once.",
            tools=[tool],
            tool_choice={"type": "auto"},
            messages=[{"role": "user", "content": text}],
        )
        tokens_in += msg.usage.input_tokens
        tokens_out += msg.usage.output_tokens
        block = next((b for b in msg.content
                      if getattr(b, "type", "") == "tool_use" and getattr(b, "name", name) == name), None)
        try:
            if block is None:
                raise InsightError(f"no {name} call")
            return validate(getattr(block, "input", None)), tokens_in, tokens_out
        except InsightError as exc:
            last_error = exc
    err = InsightError(str(last_error))
    err.tokens = (tokens_in, tokens_out)  # type: ignore[attr-defined]  # still billed: the cost guard logs it
    raise err


def _client(cfg: Config) -> Any:
    import anthropic  # lazy

    return anthropic.Anthropic(api_key=cfg.anthropic_key, max_retries=2, timeout=90)


# --- Recall grading (fast model) ------------------------------------------------------

GRADE_SYSTEM = """You grade one spoken or typed answer to a recall question for the owner of a video library.
The answer may be in English, French, Arabic or Darija, and may come from speech-to-text, so ignore filler words and
transcription slips. Compare the meaning with the expected answer and the key idea; never require exact wording.
- got: the core of the expected answer is there.
- partly: some of it is right, or it is vague.
- missed: wrong, empty, or unrelated.
feedback: one short, kind sentence in English saying what was missing (or confirming it), 20 words or fewer."""

GRADE_TOOL = {
    "name": "grade_answer",
    "description": "Record the grade of the owner's answer.",
    "input_schema": {
        "type": "object",
        "properties": {
            "verdict": {"type": "string", "enum": ["got", "partly", "missed"]},
            "feedback": {"type": "string"},
        },
        "required": ["verdict", "feedback"],
    },
}


@dataclass
class Grade:
    grade: int
    feedback: str
    input_tokens: int
    output_tokens: int
    usd: float


def grade_answer(cfg: Config, *, question: str, expected: str, key_idea: str | None, answer: str) -> Grade:
    content = (
        f"Question: {question}\nExpected answer: {expected}\nKey idea of the video: {key_idea or '(none)'}\n\n"
        f"Owner's answer:\n{answer[:2000] or '(empty)'}"
    )
    result, t_in, t_out = call_tool(_client(cfg), model=cfg.fast_model, system=GRADE_SYSTEM, tool=GRADE_TOOL,
                                    content=content, max_tokens=300, validate=normalize_grade)
    return Grade(result["grade"], result["feedback"], t_in, t_out,
                 claude_cost(t_in, t_out, cfg.fast_usd_in, cfg.fast_usd_out))


# --- Syntheses (smart model) -------------------------------------------------------------

SYNTH_SYSTEM = """You read several saved videos from one of the owner's Spaces (a topic or project) and say what they add up to.
Each save has a label like S1. Use only what the saves say; never invent facts.
- topic: what these saves are about, 2 to 6 words.
- points: 2 to 5 points of agreement, each one sentence in English, most useful first.
- disagreements: where saves contradict each other or one goes against the rest. Name the point and the labels
  of the saves behind the minority view in save_refs. Empty when they agree.
- suggested_action: one concrete thing the owner could do this week, one sentence."""

SYNTH_TOOL = {
    "name": "save_synthesis",
    "description": "Store the synthesis of the Space's saves.",
    "input_schema": {
        "type": "object",
        "properties": {
            "topic": {"type": "string"},
            "points": {"type": "array", "items": {"type": "string"}, "minItems": 1, "maxItems": 5},
            "disagreements": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {"point": {"type": "string"},
                                   "save_refs": {"type": "array", "items": {"type": "string"}}},
                    "required": ["point", "save_refs"],
                },
            },
            "suggested_action": {"type": "string"},
        },
        "required": ["topic", "points", "disagreements", "suggested_action"],
    },
}


@dataclass
class Synthesis:
    value: dict[str, Any]
    input_tokens: int
    output_tokens: int
    usd: float


def synthesize(cfg: Config, *, space_name: str, saves: list[dict[str, Any]]) -> Synthesis:
    """saves: [{"id", "title", "key_idea", "takeaways"}]. Labels S1… keep the prompt short; ids are mapped back."""
    refs: dict[str, str] = {}
    lines = []
    for i, s in enumerate(saves, start=1):
        label = f"S{i}"
        refs[label] = s["id"]
        takeaways = "; ".join(str(t) for t in (s.get("takeaways") or [])[:3])
        lines.append(f"{label} · {s.get('title') or ''}\nKey idea: {s.get('key_idea') or ''}\nTakeaways: {takeaways}")
    content = f"Space: {space_name}\n\n" + "\n\n".join(lines)
    value, t_in, t_out = call_tool(_client(cfg), model=cfg.smart_model, system=SYNTH_SYSTEM, tool=SYNTH_TOOL,
                                   content=content[:30000], max_tokens=1200,
                                   validate=lambda raw: normalize_synthesis(raw, refs))
    return Synthesis(value, t_in, t_out, claude_cost(t_in, t_out, cfg.smart_usd_in, cfg.smart_usd_out))


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
