"""Settings read from the environment. Nothing secret is ever logged."""

from __future__ import annotations

import os
from dataclasses import dataclass, field


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

    anthropic_key: str = field(default_factory=lambda: _env("ANTHROPIC_API_KEY"))
    fast_model: str = field(default_factory=lambda: _env("CLAUDE_FAST_MODEL"))
    # USD per million tokens for the fast model, used by the cost guard.
    fast_usd_in: float = field(default_factory=lambda: _float("CLAUDE_FAST_USD_PER_MTOK_IN", 1.0))
    fast_usd_out: float = field(default_factory=lambda: _float("CLAUDE_FAST_USD_PER_MTOK_OUT", 5.0))

    groq_key: str = field(default_factory=lambda: _env("GROQ_API_KEY"))
    groq_model: str = field(default_factory=lambda: _env("GROQ_TRANSCRIBE_MODEL", "whisper-large-v3-turbo"))
    groq_usd_per_hour: float = field(default_factory=lambda: _float("GROQ_USD_PER_AUDIO_HOUR", 0.04))

    voyage_key: str = field(default_factory=lambda: _env("VOYAGE_API_KEY"))
    voyage_model: str = field(default_factory=lambda: _env("VOYAGE_MODEL", "voyage-3.5-lite"))
    voyage_usd_per_mtok: float = field(default_factory=lambda: _float("VOYAGE_USD_PER_MTOK", 0.02))

    r2_account_id: str = field(default_factory=lambda: _env("R2_ACCOUNT_ID"))
    r2_access_key: str = field(default_factory=lambda: _env("R2_ACCESS_KEY_ID"))
    r2_secret_key: str = field(default_factory=lambda: _env("R2_SECRET_ACCESS_KEY"))
    r2_bucket: str = field(default_factory=lambda: _env("R2_BUCKET"))

    # Optional Netscape cookies file (base64) for Instagram when it asks for a login.
    ig_cookies_b64: str = field(default_factory=lambda: _env("INSTAGRAM_COOKIES_B64"))

    max_video_seconds: int = field(default_factory=lambda: int(_float("MAX_VIDEO_SECONDS", 600)))
    # Stop claiming new jobs after this many seconds inside one /run request.
    run_budget_seconds: int = field(default_factory=lambda: int(_float("RUN_BUDGET_SECONDS", 720)))

    @property
    def has_r2(self) -> bool:
        return all([self.r2_account_id, self.r2_access_key, self.r2_secret_key, self.r2_bucket])

    @property
    def has_claude(self) -> bool:
        return bool(self.anthropic_key and self.fast_model)

    def missing_required(self) -> list[str]:
        missing = []
        if not self.supabase_url:
            missing.append("SUPABASE_URL")
        if not self.service_key:
            missing.append("SUPABASE_SERVICE_ROLE_KEY")
        if not self.worker_secret:
            missing.append("WORKER_SECRET")
        return missing
