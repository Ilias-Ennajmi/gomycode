"""The three AI providers behind one small interface, all over plain HTTPS (httpx, no SDK).

    structured(model, system, tool, content, images, media, max_tokens) -> (raw JSON object, tokens in, tokens out)
    transcribe(model, path, mime) -> raw transcript object (+ tokens / seconds)

`tool` is {"name", "description", "input_schema"} (JSON Schema). Gemini gets it as a response
schema, Claude as a tool to call. Model ids always come from the caller (stash.config), never
from this file. Keys travel in headers only, so they cannot end up in a URL or an error message.
"""

from __future__ import annotations

import base64
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from .rules import InsightError

INLINE_MAX = 14 * 1024 * 1024  # larger media goes through the provider's file upload
RETRY_STATUS = (408, 429, 500, 502, 503, 504, 529)


class ProviderError(Exception):
    """The provider could not be reached or refused the call (after retries). No key, no body."""

    def __init__(self, provider: str, what: str, status: int = 0):
        super().__init__(f"{provider} {what}" + (f" -> {status}" if status else ""))
        self.status = status


@dataclass
class Media:
    """A file for the model to watch or listen to: a local path, or a public video URL (Gemini)."""

    mime: str
    path: Path | None = None
    url: str | None = None


def _request(provider: str, what: str, http: Any, method: str, url: str, *, sleep=time.sleep, retries: int = 2,
             **kw: Any) -> httpx.Response:
    last_status = 0
    for attempt in range(retries + 1):
        try:
            r = http.request(method, url, **kw)
        except httpx.HTTPError as exc:
            if attempt == retries:
                raise ProviderError(provider, f"{what}: {type(exc).__name__}") from None
            sleep(1.5 * (attempt + 1))
            continue
        if r.status_code in RETRY_STATUS and attempt < retries:
            last_status = r.status_code
            try:
                wait = float(r.headers.get("retry-after") or 0)
            except ValueError:
                wait = 0
            sleep(min(12.0, max(1.5 * (attempt + 1), wait)))
            continue
        return r
    raise ProviderError(provider, what, last_status)


def parse_json_text(text: str) -> Any:
    """A model's JSON answer, tolerating a ```json fence or stray prose around the object."""
    t = (text or "").strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else ""
        t = t.rsplit("```", 1)[0]
    try:
        return json.loads(t)
    except ValueError:
        a, b = t.find("{"), t.rfind("}")
        if 0 <= a < b:
            try:
                return json.loads(t[a:b + 1])
            except ValueError:
                pass
    raise InsightError("not JSON")


# --- Gemini -----------------------------------------------------------------------------

GEMINI_KEEP = ("type", "description", "enum", "properties", "required", "items", "nullable", "minItems", "maxItems")


def gemini_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """JSON Schema -> the subset Gemini's responseSchema accepts (["string","null"] becomes nullable)."""
    out: dict[str, Any] = {}
    for k, v in schema.items():
        if k not in GEMINI_KEEP:
            continue
        if k == "type" and isinstance(v, list):
            kinds = [x for x in v if x != "null"]
            out["type"] = kinds[0] if kinds else "string"
            if "null" in v:
                out["nullable"] = True
        elif k == "properties":
            out[k] = {name: gemini_schema(sub) for name, sub in v.items()}
        elif k == "items":
            out[k] = gemini_schema(v)
        else:
            out[k] = v
    if out.get("type") == "object" and "properties" in out:
        out["propertyOrdering"] = list(out["properties"])
    return out


class Gemini:
    name = "gemini"
    base = "https://generativelanguage.googleapis.com"

    def __init__(self, key: str, http: Any | None = None, sleep=time.sleep):
        self._headers = {"x-goog-api-key": key}
        self.http = http or httpx.Client(timeout=httpx.Timeout(150.0, connect=10.0))
        self._sleep = sleep

    # Files API (resumable upload), for media too large to send inline.
    def _upload(self, m: Media) -> dict[str, Any]:
        assert m.path is not None
        size = m.path.stat().st_size
        start = _request(self.name, "file start", self.http, "POST", f"{self.base}/upload/v1beta/files", sleep=self._sleep,
                         headers={**self._headers, "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start",
                                  "X-Goog-Upload-Header-Content-Length": str(size),
                                  "X-Goog-Upload-Header-Content-Type": m.mime, "Content-Type": "application/json"},
                         json={"file": {"display_name": "stash-media"}})
        target = start.headers.get("x-goog-upload-url")
        if start.status_code >= 400 or not target:
            raise ProviderError(self.name, "file start", start.status_code)
        with m.path.open("rb") as fh:
            done = _request(self.name, "file upload", self.http, "POST", target, sleep=self._sleep, retries=0,
                            headers={**self._headers, "Content-Length": str(size), "X-Goog-Upload-Offset": "0",
                                     "X-Goog-Upload-Command": "upload, finalize"}, content=fh.read())
        if done.status_code >= 400:
            raise ProviderError(self.name, "file upload", done.status_code)
        info = (done.json() or {}).get("file") or {}
        # Video is processed before it can be used: wait until ACTIVE (a short clip takes seconds).
        for _ in range(40):
            if info.get("state") in (None, "ACTIVE"):
                break
            if info.get("state") == "FAILED":
                raise ProviderError(self.name, "file processing failed")
            self._sleep(1.5)
            r = _request(self.name, "file state", self.http, "GET", f"{self.base}/v1beta/{info.get('name')}",
                         sleep=self._sleep, headers=self._headers)
            if r.status_code >= 400:
                raise ProviderError(self.name, "file state", r.status_code)
            info = r.json() or {}
        else:
            raise ProviderError(self.name, "file processing timed out")
        if not info.get("uri"):
            raise ProviderError(self.name, "file has no uri")
        return info

    def _forget(self, info: dict[str, Any]) -> None:
        try:  # files expire on their own after 48 h; this is tidiness
            self.http.request("DELETE", f"{self.base}/v1beta/{info.get('name')}", headers=self._headers, timeout=10)
        except Exception:  # noqa: BLE001
            pass

    def structured(self, *, model: str, system: str, tool: dict[str, Any], content: str,
                   images: list[tuple[bytes, str]] | None = None, media: list[Media] | None = None,
                   max_tokens: int = 1200) -> tuple[Any, int, int]:
        parts: list[dict[str, Any]] = []
        uploaded: list[dict[str, Any]] = []
        try:
            for m in media or []:
                if m.url:
                    parts.append({"file_data": {"file_uri": m.url, "mime_type": m.mime}})
                elif m.path is not None and m.path.stat().st_size <= INLINE_MAX:
                    parts.append({"inline_data": {"mime_type": m.mime,
                                                  "data": base64.b64encode(m.path.read_bytes()).decode("ascii")}})
                elif m.path is not None:
                    info = self._upload(m)
                    uploaded.append(info)
                    parts.append({"file_data": {"file_uri": info["uri"], "mime_type": m.mime}})
            for data, mime in images or []:
                parts.append({"inline_data": {"mime_type": mime, "data": base64.b64encode(data).decode("ascii")}})
            parts.append({"text": content})

            body: dict[str, Any] = {
                "system_instruction": {"parts": [{"text": system}]},
                "contents": [{"role": "user", "parts": parts}],
                "generationConfig": {
                    # Room for a thinking model's own tokens on top of the answer.
                    "maxOutputTokens": max(4096, max_tokens * 4),
                    "temperature": 0.2,
                    "responseMimeType": "application/json",
                    "responseSchema": gemini_schema(tool["input_schema"]),
                },
            }
            if any(m.mime.startswith("video/") for m in media or []):
                body["generationConfig"]["mediaResolution"] = "MEDIA_RESOLUTION_LOW"  # 4x fewer tokens per frame
            url = f"{self.base}/v1beta/models/{model}:generateContent"
            headers = {**self._headers, "Content-Type": "application/json"}
            r = _request(self.name, "generate", self.http, "POST", url, sleep=self._sleep, headers=headers, json=body)
            if r.status_code == 400:
                # A model that rejects the schema or an option still answers JSON when asked in words.
                body["generationConfig"] = {"maxOutputTokens": max(4096, max_tokens * 4), "temperature": 0.2,
                                            "responseMimeType": "application/json"}
                body["system_instruction"]["parts"][0]["text"] = (
                    f"{system}\n\nAnswer with one JSON object matching this JSON Schema, nothing else:\n"
                    + json.dumps(tool["input_schema"]))
                r = _request(self.name, "generate", self.http, "POST", url, sleep=self._sleep, headers=headers, json=body)
            if r.status_code >= 400:
                raise ProviderError(self.name, "generate", r.status_code)
        finally:
            for info in uploaded:
                self._forget(info)

        data = r.json() or {}
        usage = data.get("usageMetadata") or {}
        t_in = int(usage.get("promptTokenCount") or 0)
        t_out = int(usage.get("candidatesTokenCount") or 0) + int(usage.get("thoughtsTokenCount") or 0)
        candidate = (data.get("candidates") or [{}])[0]
        text = "".join(str(p.get("text") or "") for p in (candidate.get("content") or {}).get("parts") or []
                       if not p.get("thought"))
        if not text.strip():
            err = InsightError(f"empty answer ({candidate.get('finishReason') or 'blocked'})")
            err.tokens = (t_in, t_out)  # type: ignore[attr-defined]
            raise err
        try:
            return parse_json_text(text), t_in, t_out
        except InsightError as err:
            err.tokens = (t_in, t_out)  # type: ignore[attr-defined]
            raise


# --- Claude -----------------------------------------------------------------------------

class Claude:
    name = "claude"
    url = "https://api.anthropic.com/v1/messages"

    def __init__(self, key: str, http: Any | None = None, sleep=time.sleep):
        self._headers = {"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"}
        self.http = http or httpx.Client(timeout=httpx.Timeout(90.0, connect=10.0))
        self._sleep = sleep

    def structured(self, *, model: str, system: str, tool: dict[str, Any], content: str,
                   images: list[tuple[bytes, str]] | None = None, media: list[Media] | None = None,
                   max_tokens: int = 1200) -> tuple[Any, int, int]:
        if media:
            raise ProviderError(self.name, "cannot read audio or video")
        name = tool["name"]
        blocks: list[dict[str, Any]] = [
            {"type": "image", "source": {"type": "base64", "media_type": mime,
                                         "data": base64.b64encode(data).decode("ascii")}}
            for data, mime in images or []]
        blocks.append({"type": "text", "text": content})
        # tool_choice stays "auto": some models reject a forced tool choice. The system prompt asks
        # for the tool, and an answer without a tool_use block counts as unusable (one retry upstream).
        r = _request(self.name, "messages", self.http, "POST", self.url, sleep=self._sleep, headers=self._headers, json={
            "model": model, "max_tokens": max_tokens,
            "system": f"{system}\n\nAnswer only by calling the {name} tool, exactly once.",
            "tools": [tool], "tool_choice": {"type": "auto"},
            "messages": [{"role": "user", "content": blocks}],
        })
        if r.status_code >= 400:
            raise ProviderError(self.name, "messages", r.status_code)
        data = r.json() or {}
        usage = data.get("usage") or {}
        t_in, t_out = int(usage.get("input_tokens") or 0), int(usage.get("output_tokens") or 0)
        block = next((b for b in data.get("content") or []
                      if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("name") == name), None)
        if block is None:
            err = InsightError(f"no {name} call")
            err.tokens = (t_in, t_out)  # type: ignore[attr-defined]
            raise err
        return block.get("input"), t_in, t_out


# --- Groq (transcription only) --------------------------------------------------------------

GROQ_MAX = 25 * 1024 * 1024


class Groq:
    name = "groq"
    url = "https://api.groq.com/openai/v1/audio/transcriptions"

    def __init__(self, key: str, http: Any | None = None, sleep=time.sleep):
        self._headers = {"Authorization": f"Bearer {key}"}
        self.http = http or httpx.Client(timeout=httpx.Timeout(180.0, connect=10.0))
        self._sleep = sleep

    def transcribe(self, *, model: str, path: Path, mime: str) -> dict[str, Any]:
        """The MP4 (or voice note) itself, up to 25 MB. Returns {"segments", "language", "seconds"}."""
        if path.stat().st_size > GROQ_MAX:
            raise ProviderError(self.name, "file over 25 MB")
        r = _request(self.name, "transcribe", self.http, "POST", self.url, sleep=self._sleep, retries=1,
                     headers=self._headers,
                     data={"model": model, "response_format": "verbose_json", "temperature": "0"},
                     files={"file": (path.name, path.read_bytes(), mime)})
        if r.status_code >= 400:
            raise ProviderError(self.name, "transcribe", r.status_code)
        body = r.json() or {}
        return {"segments": body.get("segments") or [], "language": body.get("language"),
                "text": body.get("text"), "seconds": float(body.get("duration") or 0)}


def make(name: str | None, cfg: Any) -> Any | None:
    """The provider object for a name from Config.ai_provider / transcribe_provider."""
    if name == "gemini":
        return Gemini(cfg.gemini_key)
    if name == "claude":
        return Claude(cfg.anthropic_key)
    if name == "groq":
        return Groq(cfg.groq_key)
    return None
