"""Fetching a save: fast metadata (oEmbed, Open Graph), one progressive MP4 with yt-dlp, captions,
article text. No ffmpeg anywhere: nothing is merged, transcoded or probed.

Every plain HTTP fetch goes through `safe_get`, which refuses private addresses (a save's URL is
whatever a phone sent) and caps the size it reads.
"""

from __future__ import annotations

import base64
import html
import io
import ipaddress
import json
import re
import socket
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Callable
from urllib.parse import parse_qs, quote, urljoin, urlparse

import httpx

from .rules import detect_platform

UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36"
# Instagram and others serve Open Graph tags to link-preview bots more readily than to browsers.
BOT_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"
THUMB_MAX = 2 * 1024 * 1024
PAGE_MAX = 1_500_000
ARTICLE_MAX = 20_000

# Contract 0007: exactly one progressive MP4 (video + audio in one file), so nothing needs merging.
VIDEO_FORMAT = "best[ext=mp4][vcodec!=none][acodec!=none]"
VIDEO_SORT = ["vcodec:h264", "res:720"]  # plays everywhere, and small enough to keep


class DeadLink(Exception):
    """The post was removed or is private."""


class DownloadFailed(Exception):
    """The platform refused the download; the embed player is the fallback."""


class TooBig(Exception):
    """Longer than max_video_seconds or larger than video_max_mb."""


class Blocked(Exception):
    """safe_get refused the address (not http(s), or it resolves to a private network)."""


# --- Guarded HTTP ---------------------------------------------------------------------------

@dataclass
class Page:
    status: int
    url: str
    headers: dict[str, str]
    content: bytes

    @property
    def text(self) -> str:
        m = re.search(r"charset=([\w-]+)", self.headers.get("content-type", ""), re.I)
        for enc in ([m.group(1)] if m else []) + ["utf-8"]:
            try:
                return self.content.decode(enc)
            except (LookupError, UnicodeDecodeError):
                continue
        return self.content.decode("utf-8", "replace")


def host_is_public(host: str, resolver: Callable[..., Any] = socket.getaddrinfo) -> bool:
    try:
        infos = resolver(host, None)
    except OSError:
        return False
    addrs = {i[4][0] for i in infos}
    if not addrs:
        return False
    for a in addrs:
        try:
            if not ipaddress.ip_address(a.split("%")[0]).is_global:
                return False
        except ValueError:
            return False
    return True


def check_url(url: str, resolver: Callable[..., Any] = socket.getaddrinfo) -> str:
    u = urlparse(url)
    if u.scheme not in ("http", "https") or not u.hostname or u.username or u.password:
        raise Blocked("not a public http(s) address")
    if u.port not in (None, 80, 443):
        raise Blocked("unusual port")
    if not host_is_public(u.hostname, resolver):
        raise Blocked("private or unknown host")
    return url


_client: httpx.Client | None = None


def _http() -> httpx.Client:
    global _client
    if _client is None:
        _client = httpx.Client(timeout=httpx.Timeout(12.0, connect=6.0), follow_redirects=False)
    return _client


def safe_get(url: str, *, max_bytes: int = PAGE_MAX, headers: dict[str, str] | None = None,
             resolver: Callable[..., Any] = socket.getaddrinfo, http: Any | None = None) -> Page:
    """GET with every hop checked (public host, http(s), default port) and the body capped at max_bytes."""
    http = http or _http()
    for _ in range(6):
        check_url(url, resolver)
        with http.stream("GET", url, headers={"User-Agent": UA, "Accept-Language": "en", **(headers or {})}) as r:
            if r.status_code in (301, 302, 303, 307, 308) and r.headers.get("location"):
                url = urljoin(url, r.headers["location"])
                continue
            chunks, size = [], 0
            for chunk in r.iter_bytes():
                size += len(chunk)
                if size > max_bytes:
                    break
                chunks.append(chunk)
            return Page(r.status_code, str(r.url), {k.lower(): v for k, v in r.headers.items()}, b"".join(chunks))
    raise Blocked("too many redirects")


# --- Ids and embed players (contract 0007 §7) ---------------------------------------------------

_YT_ID = r"[A-Za-z0-9_-]{6,20}"


def youtube_id(url: str) -> str | None:
    u = urlparse(url)
    host = (u.hostname or "").lower()
    if host == "youtu.be":
        m = re.match(rf"^/({_YT_ID})", u.path)
        return m.group(1) if m else None
    if host.endswith("youtube.com") or host.endswith("youtube-nocookie.com"):
        v = parse_qs(u.query).get("v", [None])[0]
        if v and re.fullmatch(_YT_ID, v):
            return v
        m = re.match(rf"^/(?:shorts|embed|live|v)/({_YT_ID})", u.path)
        return m.group(1) if m else None
    return None


def instagram_ref(url: str) -> tuple[str, str] | None:
    """("p" | "reel" | "tv", shortcode)."""
    m = re.search(r"/(p|reels?|tv)/([A-Za-z0-9_-]{5,40})", urlparse(url).path)
    if not m:
        return None
    return ("reel" if m.group(1).startswith("reel") else m.group(1)), m.group(2)


def tiktok_id(url: str) -> str | None:
    m = re.search(r"/(?:video|photo|v|embed(?:/v2)?|player/v1)/(\d{5,25})", urlparse(url).path)
    return m.group(1) if m else None


def embed_url_for(platform: str, url: str, tiktok_video_id: str | None = None) -> str | None:
    if platform == "youtube":
        vid = youtube_id(url)
        return f"https://www.youtube-nocookie.com/embed/{vid}" if vid else None
    if platform == "instagram":
        ref = instagram_ref(url)
        return f"https://www.instagram.com/{ref[0]}/{ref[1]}/embed" if ref else None
    if platform == "tiktok":
        vid = tiktok_video_id if tiktok_video_id and re.fullmatch(r"\d{5,25}", str(tiktok_video_id)) else tiktok_id(url)
        return f"https://www.tiktok.com/player/v1/{vid}" if vid else None
    return None


# --- Open Graph and article text ------------------------------------------------------------------

_META = re.compile(r"<meta\b[^>]*>", re.I)
_ATTR = re.compile(r"""([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')""")


def og_tags(page: str) -> dict[str, str]:
    tags: dict[str, str] = {}
    for tag in _META.findall(page[:400_000]):
        attrs = {k.lower(): (a or b) for k, a, b in _ATTR.findall(tag)}
        key = (attrs.get("property") or attrs.get("name") or "").lower()
        if key and attrs.get("content") and (key.startswith(("og:", "twitter:", "article:")) or key in ("description", "author")):
            tags.setdefault(key, html.unescape(attrs["content"]).strip())
    m = re.search(r"<title[^>]*>(.*?)</title>", page[:400_000], re.I | re.S)
    if m:
        tags.setdefault("title", html.unescape(re.sub(r"\s+", " ", m.group(1))).strip())
    return tags


class _Text(HTMLParser):
    SKIP = {"script", "style", "noscript", "nav", "header", "footer", "aside", "form", "svg", "button", "template",
            "iframe", "figure", "select"}
    BLOCK = {"p", "h1", "h2", "h3", "h4", "li", "blockquote", "pre", "td", "div", "section", "br"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.skip = 0
        self.scope: list[str] = []          # open <article>/<main>
        self.all: list[str] = []
        self.scoped: list[str] = []
        self.buf: list[str] = []

    def _flush(self) -> None:
        text = re.sub(r"\s+", " ", "".join(self.buf)).strip()
        self.buf = []
        if len(text) >= 2:
            self.all.append(text)
            if self.scope:
                self.scoped.append(text)

    def handle_starttag(self, tag: str, attrs: Any) -> None:
        if tag in self.SKIP:
            self._flush()
            self.skip += 1
        elif tag in ("article", "main"):
            self._flush()
            self.scope.append(tag)
        elif tag in self.BLOCK:
            self._flush()

    def handle_endtag(self, tag: str) -> None:
        if tag in self.SKIP:
            self.skip = max(0, self.skip - 1)
            self.buf = []
        elif tag in ("article", "main"):
            self._flush()
            if tag in self.scope:
                self.scope.remove(tag)
        elif tag in self.BLOCK:
            self._flush()

    def handle_data(self, data: str) -> None:
        if not self.skip:
            self.buf.append(data)


def article_text(page: str) -> str:
    """Readable text of a page: what is inside <article>/<main> when that is substantial, else every
    paragraph-like block outside navigation, scripts and forms. Capped at 20 000 characters."""
    p = _Text()
    try:
        p.feed(page[:PAGE_MAX])
        p._flush()
    except Exception:  # noqa: BLE001 — broken HTML: keep what was read
        pass
    scoped = [t for t in p.scoped if len(t) >= 30 or t.endswith((".", ":", "?", "!"))]
    lines = scoped if sum(len(t) for t in scoped) >= 400 else [t for t in p.all if len(t) >= 40]
    out: list[str] = []
    for t in lines:
        if not out or out[-1] != t:
            out.append(t)
    return "\n".join(out)[:ARTICLE_MAX].strip()


# --- Metadata first (target: a few seconds) ---------------------------------------------------------

@dataclass
class Meta:
    title: str | None = None
    creator: str | None = None
    caption: str | None = None
    duration: float | None = None
    thumb_url: str | None = None
    embed_url: str | None = None
    canonical_url: str | None = None
    article: str | None = None
    found: bool = False  # anything at all came back


def _short_title(text: str | None, limit: int = 90) -> str | None:
    line = re.sub(r"\s+", " ", (text or "").split("\n")[0]).strip()
    if not line:
        return None
    return line if len(line) <= limit else line[:limit].rsplit(" ", 1)[0].rstrip(",;:") + "…"


def _oembed(endpoint: str, url: str, get: Callable[..., Page]) -> tuple[int, dict[str, Any]]:
    try:
        page = get(f"{endpoint}{quote(url, safe='')}", max_bytes=200_000)
    except (httpx.HTTPError, Blocked):
        return 0, {}
    if page.status != 200:
        return page.status, {}
    try:
        data = json.loads(page.content)
        return 200, data if isinstance(data, dict) else {}
    except ValueError:
        return 200, {}


def _page(url: str, get: Callable[..., Page], bot: bool = False) -> Page | None:
    try:
        return get(url, headers={"User-Agent": BOT_UA} if bot else None)
    except (httpx.HTTPError, Blocked):
        return None


def metadata(url: str, platform: str | None = None, get: Callable[..., Page] = safe_get) -> Meta:
    """Title, creator, caption, thumbnail URL and the embed player, without downloading the video.

    Raises DeadLink when the platform says the post is gone (404/410 from oEmbed and from the page).
    Anything else that goes wrong just leaves fields empty: a blocked page is not an error."""
    platform = platform or detect_platform(url)
    meta = Meta()

    if platform == "tiktok":
        if not tiktok_id(url):  # vm.tiktok.com / vt.tiktok.com / tiktok.com/t/…: follow to the real post
            page = _page(url, get)
            if page is not None and tiktok_id(page.url):
                meta.canonical_url = page.url.split("?")[0]
                url = meta.canonical_url
        status, o = _oembed("https://www.tiktok.com/oembed?url=", url, get)
        if o:
            meta.found = True
            meta.caption = str(o.get("title") or "").strip() or None
            handle = str(o.get("author_unique_id") or "").strip().lstrip("@")
            meta.creator = f"@{handle}" if handle else (str(o.get("author_name") or "").strip() or None)
            meta.title = _short_title(meta.caption) or (f"{meta.creator} on TikTok" if meta.creator else None)
            meta.thumb_url = o.get("thumbnail_url") or None
        elif status in (400, 404, 410):
            page = _page(url, get)
            if page is not None and page.status in (404, 410):
                raise DeadLink(str(page.status))
        meta.embed_url = embed_url_for("tiktok", url, str(o.get("embed_product_id") or "") or None)
        return meta

    if platform == "youtube":
        vid = youtube_id(url)
        meta.embed_url = embed_url_for("youtube", url)
        watch = f"https://www.youtube.com/watch?v={vid}" if vid else url
        status, o = _oembed("https://www.youtube.com/oembed?format=json&url=", watch, get)
        if o:
            meta.found = True
            meta.title = _short_title(str(o.get("title") or ""), 140)
            author_url = str(o.get("author_url") or "")
            m = re.search(r"/(@[\w.-]+)", author_url)
            meta.creator = m.group(1) if m else (str(o.get("author_name") or "").strip() or None)
            meta.thumb_url = o.get("thumbnail_url") or None
        elif status in (404, 410):
            raise DeadLink(str(status))  # the watch page answers 200 even for a removed video
        if vid and not meta.thumb_url:
            meta.thumb_url = f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"
        return meta

    # Instagram and the open web: the page's own tags.
    if platform == "instagram":
        meta.embed_url = embed_url_for("instagram", url)
    page = _page(url, get, bot=platform == "instagram")
    if page is None:
        return meta
    if page.status in (404, 410):
        raise DeadLink(str(page.status))
    if page.status != 200 or "html" not in page.headers.get("content-type", "html"):
        return meta
    text = page.text
    tags = og_tags(text)
    title = tags.get("og:title") or tags.get("twitter:title") or tags.get("title")
    description = tags.get("og:description") or tags.get("twitter:description") or tags.get("description")
    meta.thumb_url = tags.get("og:image") or tags.get("twitter:image") or None
    if meta.thumb_url:
        meta.thumb_url = urljoin(page.url, meta.thumb_url)
    if platform == "instagram":
        if "/accounts/login" in page.url or not (title or description):
            return meta  # the login wall: nothing to read, not an error
        # 'Name on Instagram: "caption"'  /  '1,234 likes, 5 comments - handle on May 1, 2026: "caption"'
        m = re.search(r"-\s*([A-Za-z0-9._]{2,40})\s+on\s", description or "")
        if m:
            meta.creator = "@" + m.group(1)
        m = re.search(r':\s*["“](.+?)["”]\.?\s*$', description or title or "", re.S)
        meta.caption = (m.group(1).strip() if m else None) or description
        meta.title = _short_title(meta.caption) or _short_title(title)
        meta.found = True
        return meta
    meta.found = bool(title or description)
    meta.title = _short_title(title, 140)
    meta.caption = description
    host = (urlparse(page.url).hostname or "").removeprefix("www.")
    meta.creator = tags.get("og:site_name") or tags.get("author") or host or None
    if page.url.startswith("https://") and page.url != url:
        meta.canonical_url = page.url
    body = article_text(text)
    if body and meta.title and not body.startswith(meta.title):
        body = f"{meta.title}\n{body}"[:ARTICLE_MAX]  # contract: title + main text
    meta.article = body or None
    return meta


# --- Thumbnails -----------------------------------------------------------------------------------

IMAGE_TYPES = ("image/jpeg", "image/png", "image/webp")


def fetch_image(url: str, get: Callable[..., Page] = safe_get) -> bytes | None:
    """The platform's own image (≤ 2 MB, jpeg/png/webp), or None."""
    try:
        page = get(url, max_bytes=THUMB_MAX + 1)
    except (httpx.HTTPError, Blocked):
        return None
    kind = page.headers.get("content-type", "").split(";")[0].strip().lower()
    if page.status != 200 or kind not in IMAGE_TYPES or not 0 < len(page.content) <= THUMB_MAX:
        return None
    return page.content


def to_jpeg(data: bytes, max_side: int = 720) -> bytes | None:
    """Re-encodes as a modest JPEG (the thumbnail's path ends in .jpg). None when it is not an image."""
    try:
        from PIL import Image  # lazy

        img = Image.open(io.BytesIO(data))
        img.thumbnail((max_side, max_side))
        buf = io.BytesIO()
        img.convert("RGB").save(buf, "JPEG", quality=82, optimize=True)
        return buf.getvalue()
    except Exception:  # noqa: BLE001
        return data if data[:3] == b"\xff\xd8\xff" else None


# --- The video: one progressive MP4 ------------------------------------------------------------------

@dataclass
class Download:
    path: Path
    size: int
    info: dict[str, Any] = field(default_factory=dict)


def _cookie_file(workdir: Path, cookies_b64: str) -> str | None:
    if not cookies_b64:
        return None
    try:
        path = workdir / "cookies.txt"
        path.write_bytes(base64.b64decode(cookies_b64))
        return str(path)
    except Exception:  # noqa: BLE001 — a broken cookie secret must not stop the download
        return None


def _first_entry(info: Any) -> dict[str, Any]:
    if isinstance(info, dict) and info.get("_type") == "playlist" and info.get("entries"):
        return next((e for e in info["entries"] if e), info)
    return info if isinstance(info, dict) else {}


def info_fields(info: dict[str, Any]) -> dict[str, Any]:
    """What yt-dlp learned about the post, in the shape of Meta fields."""
    caption = info.get("description") or None
    title = info.get("title") or None
    handle = info.get("uploader_id") if isinstance(info.get("uploader_id"), str) and not str(info.get("uploader_id")).isdigit() else None
    creator = handle or info.get("uploader") or info.get("channel")
    if creator and re.fullmatch(r"[A-Za-z0-9._]{2,40}", str(creator)):
        creator = "@" + str(creator)
    return {"caption": caption, "title": _short_title(title, 140), "creator": creator,
            "duration": info.get("duration"), "thumb_url": info.get("thumbnail"),
            "webpage_url": info.get("webpage_url")}


def download(url: str, workdir: Path, *, max_seconds: int, max_bytes: int, cookies_b64: str = "") -> Download:
    """One progressive MP4, no merge. TooBig over the limits, DownloadFailed for anything else."""
    if detect_platform(url) not in ("instagram", "tiktok", "youtube"):
        raise DownloadFailed("not a video platform")
    import yt_dlp  # heavy import kept lazy

    opts: dict[str, Any] = {
        "outtmpl": str(workdir / "video.%(ext)s"),
        "format": VIDEO_FORMAT,
        "format_sort": VIDEO_SORT,
        "noplaylist": True,
        "playlist_items": "1",
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "socket_timeout": 15,
        "retries": 1,
        "fragment_retries": 1,
        "max_filesize": max_bytes,
        "cachedir": False,  # only /tmp is writable on the function
        "match_filter": lambda info, *, incomplete=False: (
            "too long" if (info.get("duration") or 0) > max_seconds else None
        ),
    }
    cookiefile = _cookie_file(workdir, cookies_b64)
    if cookiefile:
        opts["cookiefile"] = cookiefile

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = _first_entry(ydl.extract_info(url, download=True))
    except Exception as exc:  # yt-dlp raises many types
        raise DownloadFailed(type(exc).__name__) from None

    if (info.get("duration") or 0) > max_seconds:
        raise TooBig("too long")
    video = next((p for p in workdir.glob("video.*") if p.suffix == ".mp4"), None)
    if video is None:
        size = info.get("filesize") or info.get("filesize_approx") or 0
        if size and size > max_bytes:
            raise TooBig("too large")
        raise DownloadFailed("no file")
    size = video.stat().st_size
    if size > max_bytes:
        raise TooBig("too large")
    with video.open("rb") as fh:
        head = fh.read(12)
    if size < 1024 or head[4:8] != b"ftyp":
        raise DownloadFailed("not an mp4")
    return Download(video, size, info)


# --- YouTube captions (no video download) ---------------------------------------------------------------

def parse_json3(data: Any, max_gap: float = 6.0) -> list[dict[str, Any]]:
    """YouTube's json3 captions -> [{start, end, text}], word-level lines merged into short segments."""
    events = data.get("events") if isinstance(data, dict) else None
    out: list[dict[str, Any]] = []
    for e in events or []:
        text = re.sub(r"\s+", " ", "".join(str(s.get("utf8") or "") for s in e.get("segs") or [])).strip()
        if not text:
            continue
        start = float(e.get("tStartMs") or 0) / 1000
        end = start + float(e.get("dDurationMs") or 0) / 1000
        if out and start - out[-1]["start"] < max_gap and len(out[-1]["text"]) + len(text) < 220:
            out[-1]["text"] += " " + text
            out[-1]["end"] = round(max(out[-1]["end"], end), 2)
        else:
            if out:
                out[-1]["end"] = round(min(out[-1]["end"], start) if out[-1]["end"] > start else out[-1]["end"], 2)
            out.append({"start": round(start, 2), "end": round(end, 2), "text": text})
    return out


def pick_caption_track(info: dict[str, Any]) -> tuple[str, str] | None:
    """(language, json3 url): the creator's own subtitles first, then the automatic ones, in the video's language."""
    original = str(info.get("language") or "").split("-")[0]
    wanted = [x for x in (original, "en", "fr", "ar") if x]
    for group, suffixes in ((info.get("subtitles") or {}, ("",)), (info.get("automatic_captions") or {}, ("-orig", ""))):
        langs = [f"{w}{s}" for w in wanted for s in suffixes] + [k for k in group if k != "live_chat"]
        for lang in langs:
            for track in group.get(lang) or []:
                if track.get("ext") == "json3" and track.get("url"):
                    return lang.replace("-orig", ""), track["url"]
    return None


def youtube_captions(url: str, get: Callable[..., Page] = safe_get) -> dict[str, Any] | None:
    """{"segments", "language", "info"} from the platform's own captions, or None. Never raises."""
    try:
        import yt_dlp

        opts = {"skip_download": True, "quiet": True, "no_warnings": True, "noplaylist": True, "socket_timeout": 15,
                "retries": 1, "cachedir": False, "ignore_no_formats_error": True}
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = _first_entry(ydl.extract_info(url, download=False))
        track = pick_caption_track(info)
        if not track:
            return {"segments": [], "language": None, "info": info}
        page = get(track[1], max_bytes=5_000_000)
        segments = parse_json3(json.loads(page.content)) if page.status == 200 else []
        return {"segments": segments, "language": track[0], "info": info}
    except Exception:  # noqa: BLE001 — YouTube often refuses datacentre addresses; the caller falls back
        return None
