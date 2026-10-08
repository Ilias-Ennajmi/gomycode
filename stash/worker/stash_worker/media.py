"""Download with yt-dlp, transcode with ffmpeg, and read page metadata."""

from __future__ import annotations

import base64
import html
import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from .rules import scale_filter

UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36"


class DeadLink(Exception):
    """The post was removed or is private."""


class DownloadFailed(Exception):
    """The platform refused the download; the embed player is the fallback."""


@dataclass
class Fetched:
    video: Path | None
    caption: str | None
    title: str | None
    creator: str | None
    duration: float | None
    thumb_url: str | None
    webpage_url: str | None = None


DEAD_HINTS = ("not available", "removed", "private", "404", "does not exist", "unavailable", "no longer")


def _cookie_file(workdir: Path, cookies_b64: str) -> str | None:
    if not cookies_b64:
        return None
    path = workdir / "cookies.txt"
    path.write_bytes(base64.b64decode(cookies_b64))
    return str(path)


def download(url: str, workdir: Path, max_seconds: int, cookies_b64: str = "") -> Fetched:
    import yt_dlp  # heavy import kept lazy

    opts: dict[str, Any] = {
        "outtmpl": str(workdir / "source.%(ext)s"),
        "format": "bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b",
        "merge_output_format": "mp4",
        "noplaylist": True,
        "playlist_items": "1",
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "socket_timeout": 20,
        "retries": 2,
        "max_filesize": 300 * 1024 * 1024,
        "match_filter": lambda info, *, incomplete=False: (
            "too long" if (info.get("duration") or 0) > max_seconds else None
        ),
        "http_headers": {"User-Agent": UA},
    }
    cookiefile = _cookie_file(workdir, cookies_b64)
    if cookiefile:
        opts["cookiefile"] = cookiefile

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
    except Exception as exc:  # yt-dlp raises many types
        msg = str(exc).lower()
        if any(h in msg for h in DEAD_HINTS) and "login" not in msg and "rate" not in msg:
            raise DeadLink(type(exc).__name__) from None
        raise DownloadFailed(type(exc).__name__) from None

    if info and info.get("_type") == "playlist" and info.get("entries"):
        info = next((e for e in info["entries"] if e), info)

    video = next((p for p in workdir.glob("source.*") if p.suffix in (".mp4", ".mkv", ".webm", ".mov")), None)
    caption = (info or {}).get("description") or None
    title = (info or {}).get("title") or None
    if title and caption and title.strip() == caption.strip()[: len(title.strip())]:
        title = None
    return Fetched(
        video=video,
        caption=caption,
        title=title,
        creator=(info or {}).get("uploader_id") or (info or {}).get("uploader") or (info or {}).get("channel"),
        duration=(info or {}).get("duration"),
        thumb_url=(info or {}).get("thumbnail"),
        webpage_url=(info or {}).get("webpage_url"),
    )


_META = re.compile(r'<meta[^>]+(?:property|name)=["\'](og:[a-z:]+|description)["\'][^>]*content=["\']([^"\']*)["\']', re.I)


def page_metadata(url: str) -> Fetched:
    """Fallback when the video can't be downloaded: Open Graph tags of the page."""
    try:
        r = httpx.get(url, headers={"User-Agent": UA}, follow_redirects=True, timeout=15)
    except httpx.HTTPError:
        raise DownloadFailed("page unreachable") from None
    if r.status_code in (404, 410):
        raise DeadLink(str(r.status_code))
    tags: dict[str, str] = {}
    for key, value in _META.findall(r.text[:300_000]):
        tags.setdefault(key.lower(), html.unescape(value))
    return Fetched(
        video=None,
        caption=tags.get("og:description") or tags.get("description"),
        title=tags.get("og:title"),
        creator=None,
        duration=None,
        thumb_url=tags.get("og:image"),
    )


def _run(args: list[str], timeout: int = 600) -> None:
    subprocess.run(args, check=True, capture_output=True, timeout=timeout)


def probe(path: Path) -> dict[str, Any]:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type",
         "-of", "json", str(path)],
        check=True, capture_output=True, timeout=60,
    )
    data = json.loads(out.stdout or b"{}")
    streams = {s.get("codec_type") for s in data.get("streams", [])}
    duration = float(data.get("format", {}).get("duration") or 0)
    return {"duration": duration, "has_audio": "audio" in streams, "has_video": "video" in streams}


def transcode(src: Path, dst: Path) -> None:
    """720p H.264 MP4 with faststart, so the phone starts playing immediately."""
    _run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(src),
        "-vf", scale_filter(),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-profile:v", "high", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "96k", "-ac", "2",
        "-movflags", "+faststart", str(dst),
    ])


def thumbnail(src: Path, dst: Path, at_seconds: float = 1.0) -> None:
    _run([
        "ffmpeg", "-y", "-loglevel", "error", "-ss", f"{at_seconds:.2f}", "-i", str(src),
        "-frames:v", "1", "-vf", "scale='min(540,iw)':-2", "-q:v", "4", str(dst),
    ], timeout=60)


def audio_for_transcription(src: Path, dst: Path) -> None:
    """Mono 16 kHz MP3: small enough for the transcription API's upload limit."""
    _run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(src),
        "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", str(dst),
    ])


def fetch_image(url: str, dst: Path) -> bool:
    try:
        r = httpx.get(url, headers={"User-Agent": UA}, follow_redirects=True, timeout=15)
        if r.status_code == 200 and r.headers.get("content-type", "").startswith("image/") and len(r.content) < 5_000_000:
            dst.write_bytes(r.content)
            return True
    except httpx.HTTPError:
        pass
    return False
