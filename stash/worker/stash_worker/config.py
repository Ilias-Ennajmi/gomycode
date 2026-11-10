"""Settings for one run. Nothing here comes from a file or (apart from SUPABASE_URL) from the environment.

The worker holds no secret: `/run` receives the wake-up token, asks stash-worker-proxy for
`worker_config()` and builds this object from the answer. It lives in memory for that request only.
Keys never appear in a log line, a repr or an exception message.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Mapping

EMBED_MODEL = "gte-small"  # built into Supabase Edge Functions (384 dims); the proxy runs it


def supabase_url_from_env() -> str:
    return os.environ.get("SUPABASE_URL", "").strip().rstrip("/")


@dataclass(frozen=True)
class Config:
    supabase_url: str = ""
    anon_key: str = field(default="", repr=False)
    # Auth user ids allowed to use AI and video storage. Empty = nobody.
    owner_user_ids: frozenset[str] = frozenset()

    gemini_key: str = field(default="", repr=False)
    groq_key: str = field(default="", repr=False)
    anthropic_key: str = field(default="", repr=False)
    # Optional Netscape cookies file (base64) for Instagram when it asks for a login.
    ig_cookies_b64: str = field(default="", repr=False)

    # Rows of stash.config (key -> value). Model ids and prices live here, never in a file.
    values: Mapping[str, str] = field(default_factory=dict)

    @classmethod
    def from_worker_config(cls, payload: Mapping[str, Any], supabase_url: str = "") -> "Config":
        keys = payload.get("keys") or {}
        values = {str(k): str(v) for k, v in (payload.get("config") or {}).items() if v is not None}
        return cls(
            supabase_url=(supabase_url or str(payload.get("supabase_url") or "")).rstrip("/"),
            anon_key=str(payload.get("anon_key") or ""),
            owner_user_ids=frozenset(str(x).lower() for x in (payload.get("owner_ids") or []) if x),
            gemini_key=str(keys.get("gemini") or "").strip(),
            groq_key=str(keys.get("groq") or "").strip(),
            anthropic_key=str(keys.get("anthropic") or "").strip(),
            ig_cookies_b64=str(payload.get("instagram_cookies_b64") or "").strip(),
            values=values,
        )

    # --- raw values -----------------------------------------------------------------
    def get(self, key: str, default: str = "") -> str:
        v = self.values.get(key)
        return v.strip() if isinstance(v, str) and v.strip() else default

    def num(self, key: str, default: float) -> float:
        try:
            return float(self.get(key) or default)
        except ValueError:
            return default

    # --- providers --------------------------------------------------------------------
    def _key(self, provider: str) -> str:
        return {"gemini": self.gemini_key, "claude": self.anthropic_key, "groq": self.groq_key}.get(provider, "")

    def model(self, provider: str, tier: str = "fast") -> str:
        """Model id for a provider and tier ("fast" | "smart"). Smart falls back to fast when unset."""
        if provider == "groq":
            return self.get("groq_transcribe_model")
        return self.get(f"{provider}_{tier}_model") or self.get(f"{provider}_fast_model")

    def usable(self, provider: str) -> bool:
        """A provider is usable only when its key and its model id both exist."""
        return bool(self._key(provider) and self.model(provider, "fast"))

    @property
    def ai_provider(self) -> str | None:
        """gemini | claude | None, from config `ai_provider` and what is usable."""
        want = self.get("ai_provider", "auto").lower()
        if want == "none":
            return None
        if want in ("gemini", "claude"):
            return want if self.usable(want) else None
        return next((p for p in ("gemini", "claude") if self.usable(p)), None)

    @property
    def transcribe_provider(self) -> str | None:
        """gemini | groq | None, from config `transcribe_provider` and what is usable."""
        want = self.get("transcribe_provider", "auto").lower()
        if want == "none":
            return None
        if want in ("gemini", "groq"):
            return want if self.usable(want) else None
        return next((p for p in ("gemini", "groq") if self.usable(p)), None)

    @property
    def has_ai(self) -> bool:
        return self.ai_provider is not None

    # Older names, still read by the export and Galaxy code.
    has_claude = has_ai
    has_smart = has_ai

    def price(self, provider: str, tier: str) -> tuple[float, float]:
        """USD per million tokens (in, out). No row = 0: a free tier costs nothing."""
        return (max(0.0, self.num(f"price_{provider}_{tier}_in", 0.0)),
                max(0.0, self.num(f"price_{provider}_{tier}_out", 0.0)))

    @property
    def groq_usd_per_hour(self) -> float:
        return max(0.0, self.num("price_groq_audio_hour", 0.0))

    # --- limits -----------------------------------------------------------------------
    @property
    def max_video_seconds(self) -> int:
        return int(self.num("max_video_seconds", 600))

    @property
    def video_max_bytes(self) -> int:
        # The bucket refuses files over 50 MB whatever this says.
        return int(min(50.0, max(1.0, self.num("video_max_mb", 45))) * 1024 * 1024)

    @property
    def youtube_download(self) -> bool:
        return self.get("youtube_download", "off").lower() in ("on", "1", "true", "yes")

    @property
    def run_budget_seconds(self) -> int:
        return int(min(280.0, max(5.0, self.num("run_budget_seconds", 240))))

    @property
    def worker_max_seconds(self) -> int:
        """The function's maximum duration (vercel.json `maxDuration`). Change both together."""
        return int(min(800.0, max(30.0, self.num("worker_max_seconds", 300))))

    @property
    def backup_keep(self) -> int:
        return int(min(52.0, max(1.0, self.num("backup_keep", 4))))

    @property
    def geocode(self) -> bool:
        """Place names -> coordinates through OpenStreetMap Nominatim (free, 1 request/second)."""
        return self.get("geocode", "on").lower() not in ("off", "0", "false", "no")
