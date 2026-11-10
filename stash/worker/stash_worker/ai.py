"""What the worker asks an AI for. One seam, three providers (see providers.py).

Every function takes the run's Config, picks the provider from it (`ai_provider`,
`transcribe_provider`, the keys and model ids that exist) and returns a small result object
with the tokens, the cost and the provider's name for the `usage` table.

    understand      text of a save -> insights
    read_screenshot image -> insights + what is written on it (vision)
    transcribe      the MP4 / voice note itself -> timed segments
    grade_answer    recall answer -> got / partly / missed
    synthesize      several saves -> what they add up to
    ask             question + the owner's best saves -> answer with citations
    structured      anything else (export brief, Galaxy labels)

A model's JSON is validated and asked for once more when unusable (InsightError after that).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, TypeVar

from . import providers
from .config import Config
from .providers import Media, ProviderError
from .rules import (INTENTS, InsightError, cost, normalize_answer, normalize_grade, normalize_insights,
                    normalize_screenshot, normalize_synthesis, normalize_transcript)

T = TypeVar("T")

__all__ = ["InsightError", "ProviderError"]


class NoProvider(Exception):
    """No usable provider for this call (no key, or no model id in stash.config)."""


@dataclass
class Transcript:
    segments: list[dict[str, Any]]
    text: str
    language: str | None
    seconds: float
    provider: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    usd: float = 0.0
    visual: str | None = None  # what the video shows (Gemini watches the picture too)


# --- The seam ---------------------------------------------------------------------------

def _provider(cfg: Config, name: str | None) -> Any:
    p = providers.make(name, cfg)
    if p is None:
        raise NoProvider(name or "none")
    return p


def call_structured(
    provider: Any,
    *,
    model: str,
    system: str,
    tool: dict[str, Any],
    content: str,
    max_tokens: int,
    validate: Callable[[Any], T],
    images: list[tuple[bytes, str]] | None = None,
    media: list[Media] | None = None,
) -> tuple[T, int, int]:
    """One structured call; validated, and asked once more if unusable.

    Returns (validated value, input tokens, output tokens) summed over both attempts. After two
    unusable answers raises InsightError carrying `.tokens` (still billed: the cost guard logs it).
    """
    tokens_in = tokens_out = 0
    last_error: Exception | None = None
    for attempt in range(2):
        text = content
        if attempt == 1 and last_error is not None:
            text += f"\n\nYour previous answer was unusable ({last_error}). Answer again with every required field."
        try:
            raw, t_in, t_out = provider.structured(model=model, system=system, tool=tool, content=text,
                                                   images=images, media=media, max_tokens=max_tokens)
            tokens_in += t_in
            tokens_out += t_out
            return validate(raw), tokens_in, tokens_out
        except InsightError as exc:
            spent = getattr(exc, "tokens", None)
            if spent:
                tokens_in += spent[0]
                tokens_out += spent[1]
            last_error = InsightError(str(exc))
    err = InsightError(str(last_error))
    err.tokens = (tokens_in, tokens_out)  # type: ignore[attr-defined]
    raise err


@dataclass
class Structured:
    value: Any
    input_tokens: int
    output_tokens: int
    usd: float
    provider: str


def structured(cfg: Config, tier: str, *, system: str, tool: dict[str, Any], content: str, max_tokens: int,
               validate: Callable[[Any], T], images: list[tuple[bytes, str]] | None = None,
               media: list[Media] | None = None, provider_name: str | None = None) -> Structured:
    """A structured call on the configured provider. tier: "fast" | "smart" (smart falls back to fast)."""
    name = provider_name or cfg.ai_provider
    provider = _provider(cfg, name)
    usd_in, usd_out = cfg.price(name, tier)
    try:
        value, t_in, t_out = call_structured(provider, model=cfg.model(name, tier), system=system, tool=tool,
                                             content=content, max_tokens=max_tokens, validate=validate,
                                             images=images, media=media)
    except InsightError as exc:
        t = getattr(exc, "tokens", (0, 0))
        exc.usd = cost(t[0], t[1], usd_in, usd_out)  # type: ignore[attr-defined]
        exc.provider = name  # type: ignore[attr-defined]
        raise
    return Structured(value, t_in, t_out, cost(t_in, t_out, usd_in, usd_out), name)


# --- Transcription ------------------------------------------------------------------------

TRANSCRIBE_SYSTEM = """You transcribe one short social video or voice note for its owner.
- segments: everything that is spoken, in order, in the language it is spoken in (never translate), split into
  short lines of one sentence or less, each with start and end in seconds from the beginning.
- Songs and background music are not speech: leave them out. No speech at all -> an empty segments list.
- language: ISO 639-1 code of the speech (en, fr, ar...; Darija = ar), or "" when there is none.
- visual: for a video, one or two sentences on what is shown and any text written on screen; "" for audio.
Never invent words that are not said."""

TRANSCRIBE_TOOL = {
    "name": "save_transcript",
    "description": "Store the timed transcript.",
    "input_schema": {
        "type": "object",
        "properties": {
            "language": {"type": "string"},
            "segments": {
                "type": "array",
                "items": {"type": "object",
                          "properties": {"start": {"type": "number"}, "end": {"type": "number"},
                                         "text": {"type": "string"}},
                          "required": ["start", "end", "text"]},
            },
            "visual": {"type": "string"},
        },
        "required": ["language", "segments", "visual"],
    },
}


def _transcript(value: dict[str, Any], seconds: float, **kw: Any) -> Transcript:
    segments = value["segments"]
    return Transcript(segments=segments, text=" ".join(s["text"] for s in segments).strip(),
                      language=value.get("language"),
                      seconds=seconds or (float(segments[-1]["end"]) if segments else 0.0),
                      visual=value.get("visual"), **kw)


def transcribe(cfg: Config, path: Path, mime: str = "video/mp4", seconds: float = 0.0) -> Transcript | None:
    """Timed segments from the file itself (no ffmpeg: the provider takes the MP4 or the voice note).

    Returns None when no transcription provider is usable."""
    name = cfg.transcribe_provider
    if name == "groq":
        raw = providers.make("groq", cfg).transcribe(model=cfg.model("groq"), path=path, mime=mime)
        value = normalize_transcript(raw)
        secs = float(raw.get("seconds") or 0) or seconds
        return _transcript(value, secs, provider="groq", usd=round(secs / 3600 * cfg.groq_usd_per_hour, 6))
    if name == "gemini":
        r = structured(cfg, "fast", provider_name="gemini", system=TRANSCRIBE_SYSTEM, tool=TRANSCRIBE_TOOL,
                       content="Transcribe this.", max_tokens=4000, validate=normalize_transcript,
                       media=[Media(mime=mime, path=path)])
        return _transcript(r.value, seconds, provider="gemini", input_tokens=r.input_tokens,
                           output_tokens=r.output_tokens, usd=r.usd)
    return None


def transcribe_url(cfg: Config, url: str, seconds: float = 0.0) -> Transcript | None:
    """A public YouTube video, watched by Gemini straight from its URL (no download). None when unavailable."""
    if cfg.transcribe_provider != "gemini":
        return None
    r = structured(cfg, "fast", provider_name="gemini", system=TRANSCRIBE_SYSTEM, tool=TRANSCRIBE_TOOL,
                   content="Transcribe this.", max_tokens=6000, validate=normalize_transcript,
                   media=[Media(mime="video/mp4", url=url)])
    return _transcript(r.value, seconds, provider="gemini", input_tokens=r.input_tokens,
                       output_tokens=r.output_tokens, usd=r.usd)


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
- highlights: up to 3 lines worth keeping, copied word for word from the transcript (or the caption / article when
  there is no transcript). Empty when nothing stands out.
- language: ISO 639-1 code of the content (en, fr, ar…; Darija = ar)."""

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
            "highlights": {"type": "array", "items": {"type": "string"}},
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
    provider: str = ""


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
    visual: str | None = None,
) -> Understanding:
    """One fast-model call from whatever text exists (a caption alone is enough)."""
    spaces = ", ".join(sorted({n for n in space_names})) or "(none yet)"
    content = (
        f"Platform: {platform}\nCreator: {creator or 'unknown'}\n"
        f"Owner's Spaces: {spaces}\n"
        f"Owner's note: {user_note or '(none)'}\n\n"
        f"Title: {title or '(none)'}\n\nCaption:\n{(caption or '(none)')[:4000]}\n\n"
        + (f"What the video shows: {visual}\n\n" if visual else "")
        + f"Transcript or article text:\n{(transcript or '(empty: no speech or not transcribed)')[:12000]}"
    )
    r = structured(cfg, "fast", system=SYSTEM, tool=TOOL, content=content, max_tokens=1400,
                   validate=lambda raw: normalize_insights(raw, space_names))
    return Understanding(r.value, r.input_tokens, r.output_tokens, r.usd, r.provider)


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
    """Vision on a shared screenshot: the same insights as a video, plus who posted it and its text."""
    spaces = ", ".join(sorted({n for n in space_names})) or "(none yet)"
    r = structured(cfg, "fast", system=SCREENSHOT_SYSTEM, tool=SCREENSHOT_TOOL,
                   content=f"Owner's Spaces: {spaces}\nOwner's note: {user_note or '(none)'}\n\nRead this screenshot.",
                   max_tokens=1500, validate=lambda raw: normalize_screenshot(raw, space_names),
                   images=[(image, media_type)])
    return Understanding(r.value, r.input_tokens, r.output_tokens, r.usd, r.provider)


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
    provider: str = ""


def grade_answer(cfg: Config, *, question: str, expected: str, key_idea: str | None, answer: str) -> Grade:
    content = (
        f"Question: {question}\nExpected answer: {expected}\nKey idea of the video: {key_idea or '(none)'}\n\n"
        f"Owner's answer:\n{answer[:2000] or '(empty)'}"
    )
    r = structured(cfg, "fast", system=GRADE_SYSTEM, tool=GRADE_TOOL, content=content, max_tokens=300,
                   validate=normalize_grade)
    return Grade(r.value["grade"], r.value["feedback"], r.input_tokens, r.output_tokens, r.usd, r.provider)


# --- Syntheses (smart model) -------------------------------------------------------------

SYNTH_SYSTEM = """You read several saved videos from one of the owner's Spaces or tags (a topic or project) and say what they add up to.
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
    provider: str = ""


def synthesize(cfg: Config, *, space_name: str, saves: list[dict[str, Any]], kind: str = "Space") -> Synthesis:
    """saves: [{"id", "title", "key_idea", "takeaways"}]. Labels S1… keep the prompt short; ids are mapped back."""
    refs: dict[str, str] = {}
    lines = []
    for i, s in enumerate(saves, start=1):
        label = f"S{i}"
        refs[label] = s["id"]
        takeaways = "; ".join(str(t) for t in (s.get("takeaways") or [])[:3])
        lines.append(f"{label} · {s.get('title') or ''}\nKey idea: {s.get('key_idea') or ''}\nTakeaways: {takeaways}")
    content = f"{kind}: {space_name}\n\n" + "\n\n".join(lines)
    r = structured(cfg, "smart", system=SYNTH_SYSTEM, tool=SYNTH_TOOL, content=content[:30000], max_tokens=1200,
                   validate=lambda raw: normalize_synthesis(raw, refs))
    return Synthesis(r.value, r.input_tokens, r.output_tokens, r.usd, r.provider)


# --- Ask (fast model) -----------------------------------------------------------------------

ASK_SYSTEM = """You answer one question for the owner of a library of saved videos, posts and articles.
Use only the saves given below (each has a label like S1). If they do not answer the question, say so plainly;
never use outside knowledge and never invent facts.
- answer: short and direct, 1 to 5 sentences (or a short list), in the language of the question.
- cited: the labels of the saves the answer really relies on, most important first. Empty when none helped."""

ASK_TOOL = {
    "name": "answer_question",
    "description": "Store the answer and the saves it relies on.",
    "input_schema": {
        "type": "object",
        "properties": {
            "answer": {"type": "string"},
            "cited": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["answer", "cited"],
    },
}


@dataclass
class Answer:
    answer: str
    cited: list[str]
    input_tokens: int
    output_tokens: int
    usd: float
    provider: str = ""


def ask(cfg: Config, *, question: str, context: list[dict[str, Any]]) -> Answer:
    """context: rows of ask_context(). Labels S1… keep the prompt short; only ids from the context come back."""
    refs: dict[str, str] = {}
    lines = []
    for i, c in enumerate(context, start=1):
        label = f"S{i}"
        refs[label] = str(c["save_id"])
        takeaways = "; ".join(str(t) for t in (c.get("takeaways") or [])[:3])
        part = (f"{label} · {c.get('title') or '(untitled)'} · {c.get('platform') or ''} · {c.get('creator') or ''} · "
                f"saved {str(c.get('saved_at') or '')[:10]}")
        for name, value, limit in (("Key idea", c.get("key_idea"), 300), ("Takeaways", takeaways, 500),
                                   ("Caption", c.get("caption"), 500), ("Excerpt", c.get("excerpt"), 1200)):
            if value:
                part += f"\n{name}: {str(value)[:limit]}"
        lines.append(part)
    content = f"Question: {question[:500]}\n\nSaves:\n\n" + "\n\n".join(lines)
    r = structured(cfg, "fast", system=ASK_SYSTEM, tool=ASK_TOOL, content=content[:24000], max_tokens=700,
                   validate=lambda raw: normalize_answer(raw, refs))
    return Answer(r.value["answer"], r.value["cited"], r.input_tokens, r.output_tokens, r.usd, r.provider)
