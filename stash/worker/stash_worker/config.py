"""Settings read from the environment. Nothing secret is ever logged."""

from __future__ import annotations

import os
from dataclasses import dataclass, field, replace
from typing import Any


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _float(name: str, default: float) -> float:
    try:
        return float(_env(name) or default)
    except ValueError:
        return default


@dataclass(frozen=True)
class Config:
    supabase_url: str = field(default_factory=lambda: _env("SUPABASE_URL").rstrip("/"))
    service_key: str = field(default_factory=lambda: _env("SUPABASE_SERVICE_ROLE_KEY"))
    worker_secret: str = field(default_factory=lambda: _env("WORKER_SECRET"))
    # Comma-separated auth user ids allowed to spend the AI budget. Empty = nobody.
    owner_user_ids: frozenset[str] = field(
        default_factory=lambda: frozenset(x.strip() for x in _env("OWNER_USER_IDS").split(",") if x.strip())
    )

    # Summaries: Groq's free tier when GROQ_INSIGHTS_MODEL is set (the default setup), else Claude.
    groq_insights_model: str = field(default_factory=lambda: _env("GROQ_INSIGHTS_MODEL"))

    anthropic_key: str = field(default_factory=lambda: _env("ANTHROPIC_API_KEY"))
    fast_model: str = field(default_factory=lambda: _env("CLAUDE_FAST_MODEL"))
    # USD per million tokens for the fast model, used by the cost guard.
    fast_usd_in: float = field(default_factory=lambda: _float("CLAUDE_FAST_USD_PER_MTOK_IN", 1.0))
    fast_usd_out: float = field(default_factory=lambda: _float("CLAUDE_FAST_USD_PER_MTOK_OUT", 5.0))

    groq_key: str = field(default_factory=lambda: _env("GROQ_API_KEY"))
    groq_model: str = field(default_factory=lambda: _env("GROQ_TRANSCRIBE_MODEL", "whisper-large-v3-turbo"))
    groq_usd_per_hour: float = field(default_factory=lambda: _float("GROQ_USD_PER_AUDIO_HOUR", 0))

    voyage_key: str = field(default_factory=lambda: _env("VOYAGE_API_KEY"))
    voyage_model: str = field(default_factory=lambda: _env("VOYAGE_MODEL", "voyage-4-lite"))
    voyage_usd_per_mtok: float = field(default_factory=lambda: _float("VOYAGE_USD_PER_MTOK", 0))

    # Videos go to this private Supabase Storage bucket, kept under the quota (oldest archived go first).
    video_bucket: str = field(default_factory=lambda: _env("VIDEO_BUCKET", "stash-videos"))
    video_quota_mb: float = field(default_factory=lambda: _float("VIDEO_QUOTA_MB", 800))
    video_max_mb: float = field(default_factory=lambda: _float("VIDEO_MAX_MB", 45))

    # Optional Netscape cookies file (base64) for Instagram when it asks for a login.
    ig_cookies_b64: str = field(default_factory=lambda: _env("INSTAGRAM_COOKIES_B64"))

    max_video_seconds: int = field(default_factory=lambda: int(_float("MAX_VIDEO_SECONDS", 600)))
    # Stop claiming new jobs after this many seconds in one run.
    run_budget_seconds: int = field(default_factory=lambda: int(_float("RUN_BUDGET_SECONDS", 1200)))

    @property
    def has_video_storage(self) -> bool:
        return bool(self.video_bucket) and self.video_quota_mb > 0

    @property
    def insights_provider(self) -> str | None:
        """'groq' (free), 'claude', or None when no summary model is configured."""
        if self.groq_key and self.groq_insights_model:
            return "groq"
        if self.anthropic_key and self.fast_model:
            return "claude"
        return None

    @property
    def has_ai(self) -> bool:
        return self.insights_provider is not None

    @property
    def insights_model(self) -> str:
        return self.groq_insights_model if self.insights_provider == "groq" else self.fast_model

    def missing_required(self) -> list[str]:
        missing = []
        if not self.supabase_url:
            missing.append("SUPABASE_URL")
        if not self.service_key:
            missing.append("SUPABASE_SERVICE_ROLE_KEY")
        return missing


# Vault name (without "stash_") → Config field. Env vars win when both are set.
_REMOTE_FIELDS = {
    "groq_api_key": "groq_key",
    "groq_insights_model": "groq_insights_model",
    "voyage_api_key": "voyage_key",
    "owner_user_ids": "owner_user_ids",
    "instagram_cookies_b64": "ig_cookies_b64",
}


def with_remote(cfg: Config, remote: dict[str, Any]) -> Config:
    """Fills settings missing from the environment with the ones kept in Supabase Vault."""
    changes: dict[str, Any] = {}
    for key, attr in _REMOTE_FIELDS.items():
        value = str(remote.get(key) or "").strip()
        if not value or getattr(cfg, attr):
            continue
        if attr == "owner_user_ids":
            changes[attr] = frozenset(x.strip() for x in value.split(",") if x.strip())
        else:
            changes[attr] = value
    return replace(cfg, **changes) if changes else cfg
