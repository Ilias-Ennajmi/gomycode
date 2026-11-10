"""Metadata, embed players, article text, captions and the guarded fetch. No network, no ffmpeg."""

from __future__ import annotations

import io
import json
import re
from pathlib import Path

import httpx
import pytest
from PIL import Image

from stash_worker import deadline, media
from stash_worker.media import Page
from stash_worker.rules import decide_playback

# The database's own check on saves.embed_url (migration 0007): what the worker builds must pass it.
SQL = (Path(__file__).resolve().parents[2] / "supabase/migrations/0007_free_pipeline.sql").read_text()
EMBED_RE = re.compile(re.search(r"embed_url ~\s*'(\^https://.+?\$)'", SQL, re.S).group(1))


def page(body="", status=200, url="https://example.com/x", ctype="text/html; charset=utf-8"):
    return Page(status, url, {"content-type": ctype}, body.encode() if isinstance(body, str) else body)


def getter(routes):
    """A fake safe_get: the first route whose key is in the URL answers (a Page, or an exception)."""
    seen = []

    def get(url, **kw):
        seen.append(url)
        for key, value in routes.items():
            if key in url:
                if isinstance(value, Exception):
                    raise value
                return value
        return page(status=404, url=url)

    get.seen = seen
    return get


@pytest.mark.parametrize("platform,url,expected", [
    ("youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"),
    ("youtube", "https://youtu.be/dQw4w9WgXcQ?si=x", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"),
    ("youtube", "https://m.youtube.com/shorts/abc_DEF-123", "https://www.youtube-nocookie.com/embed/abc_DEF-123"),
    ("youtube", "https://www.youtube.com/@channel", None),
    ("instagram", "https://www.instagram.com/reel/Cxyz_12-AB/?igsh=1", "https://www.instagram.com/reel/Cxyz_12-AB/embed"),
    ("instagram", "https://www.instagram.com/reels/Cxyz_12-AB/", "https://www.instagram.com/reel/Cxyz_12-AB/embed"),
    ("instagram", "https://www.instagram.com/someone/p/Cxyz_12-AB/", "https://www.instagram.com/p/Cxyz_12-AB/embed"),
    ("instagram", "https://www.instagram.com/someone/", None),
    ("tiktok", "https://www.tiktok.com/@a/video/7234567890123456789?lang=en", "https://www.tiktok.com/player/v1/7234567890123456789"),
    ("tiktok", "https://vm.tiktok.com/ZMabc/", None),
    ("web", "https://example.com/post", None),
])
def test_embed_urls_match_the_contract_and_the_database_check(platform, url, expected):
    got = media.embed_url_for(platform, url)
    assert got == expected
    if got:
        assert EMBED_RE.match(got)


def test_a_hostile_id_never_reaches_the_embed_url():
    assert media.embed_url_for("tiktok", "https://www.tiktok.com/@a/video/123456789", '1"><script>') == \
        "https://www.tiktok.com/player/v1/123456789"
    assert media.embed_url_for("youtube", "https://www.youtube.com/watch?v=<script>alert(1)") is None


@pytest.mark.parametrize("platform,state,embed,expected", [
    ("tiktok", "stored", "e", "video"), ("tiktok", "blocked", "e", "embed"), ("tiktok", "blocked", None, "link"),
    ("instagram", "too_big", "e", "embed"), ("youtube", "none", "e", "embed"), ("tiktok", "evicted", "e", "embed"),
    ("tiktok", "none", None, "link"), ("web", "none", None, "link"), ("screenshot", "none", None, "none"),
])
def test_playback_decision_table(platform, state, embed, expected):
    assert decide_playback(platform, state, embed) == expected


def test_tiktok_metadata_from_oembed_resolving_a_short_link():
    get = getter({
        "vm.tiktok.com": page(url="https://www.tiktok.com/@chef/video/7234567890123456789?_r=1"),
        "tiktok.com/oembed": page(json.dumps({
            "title": "3 pricing tricks that work #pricing", "author_unique_id": "chef", "author_name": "Chef",
            "thumbnail_url": "https://p16.tiktokcdn.com/t.jpg", "embed_product_id": "7234567890123456789"}), ctype="application/json"),
    })
    m = media.metadata("https://vm.tiktok.com/ZMabc/", "tiktok", get)
    assert m.title == "3 pricing tricks that work #pricing" and m.caption == m.title and m.creator == "@chef"
    assert m.thumb_url.endswith("t.jpg") and m.embed_url == "https://www.tiktok.com/player/v1/7234567890123456789"
    assert m.canonical_url == "https://www.tiktok.com/@chef/video/7234567890123456789"
    assert "%2F%40chef%2Fvideo%2F7234567890123456789" in get.seen[1]  # oEmbed is asked about the real post

    # A short link that lands somewhere else is not taken as the post's address.
    away = getter({"vm.tiktok.com": page(url="https://tiktok.com.evil.example/@chef/video/7234567890123456789")})
    assert media.metadata("https://vm.tiktok.com/ZMabc/", "tiktok", away).canonical_url is None


def test_tiktok_gone_from_oembed_and_page_is_a_dead_link_but_a_block_is_not():
    url = "https://www.tiktok.com/@a/video/7234567890123456789"
    with pytest.raises(media.DeadLink):
        media.metadata(url, "tiktok", getter({}))  # everything answers 404
    blocked = getter({"oembed": page(status=403), "/video/": page(status=403)})
    m = media.metadata(url, "tiktok", blocked)
    assert not m.found and m.embed_url == "https://www.tiktok.com/player/v1/7234567890123456789"
    offline = getter({"tiktok": media.Blocked("no route")})
    assert media.metadata(url, "tiktok", offline).embed_url  # a network failure is not an error either


def test_youtube_metadata():
    get = getter({"youtube.com/oembed": page(json.dumps({
        "title": "How pricing works", "author_name": "Some Channel", "author_url": "https://www.youtube.com/@somechannel",
        "thumbnail_url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"}), ctype="application/json")})
    m = media.metadata("https://youtu.be/dQw4w9WgXcQ", "youtube", get)
    assert m.title == "How pricing works" and m.creator == "@somechannel" and m.thumb_url
    assert m.embed_url == "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" and len(get.seen) == 1
    with pytest.raises(media.DeadLink):
        media.metadata("https://youtu.be/dQw4w9WgXcQ", "youtube", getter({}))
    private = media.metadata("https://youtu.be/dQw4w9WgXcQ", "youtube", getter({"oembed": page(status=401)}))
    assert private.embed_url and private.thumb_url.endswith("/dQw4w9WgXcQ/hqdefault.jpg")


IG = """<html><head><meta property="og:title" content="Casa Eats on Instagram: &quot;Le meilleur msemen&quot;">
<meta content="1,234 likes, 5 comments - casa.eats on May 1, 2026: &quot;Le meilleur msemen de Casa&quot;. " property="og:description">
<meta property="og:image" content="https://scontent.cdninstagram.com/x.jpg"></head></html>"""


def test_instagram_og_tags_and_the_login_wall():
    url = "https://www.instagram.com/reel/Cxyz_12-AB/"
    m = media.metadata(url, "instagram", getter({"instagram.com": page(IG, url=url)}))
    assert m.creator == "@casa.eats" and m.caption == "Le meilleur msemen de Casa" and m.title == m.caption
    assert m.thumb_url.endswith("x.jpg") and m.embed_url == "https://www.instagram.com/reel/Cxyz_12-AB/embed"
    wall = media.metadata(url, "instagram", getter({"instagram.com": page("<html></html>", url="https://www.instagram.com/accounts/login/")}))
    assert not wall.found and wall.title is None and wall.embed_url  # often blocked: skipped, not an error
    with pytest.raises(media.DeadLink):
        media.metadata(url, "instagram", getter({}))


ARTICLE = """<html><head><title>Plain title</title><meta property="og:title" content="Decoy pricing, explained">
<meta name="description" content="Why three tiers sell."><meta property="og:image" content="/img/cover.png">
<meta property="og:site_name" content="The Pricing Blog"></head><body>
<nav><a href="/">Home</a><p>Subscribe to our newsletter for more articles like this one, every week.</p></nav>
<script>var tracking = "do not read this, it is code not prose at all";</script>
<article><h1>Decoy pricing, explained</h1>
<p>A decoy tier is a third option that exists to make another one look like the obvious choice for most buyers.</p>
<p>Put it next to the plan you want to sell, priced close to it but clearly worse, and conversions move up.</p>
<p>The classic example is the magazine subscription experiment that behavioural economists love to quote in talks.</p>
<p>Test it for two weeks before you keep it: the effect depends on your audience and on what they compare against.</p>
<p>Finally, write the tiers so the difference is visible at a glance, because nobody reads a pricing table twice.</p>
</article><footer><p>Copyright notice and a long list of links that nobody needs in a summary of the article.</p></footer></body></html>"""


def test_web_metadata_and_article_text():
    m = media.metadata("https://blog.example.com/decoy", "web",
                       getter({"blog.example.com": page(ARTICLE, url="https://blog.example.com/decoy")}))
    assert m.title == "Decoy pricing, explained" and m.caption == "Why three tiers sell."
    assert m.creator == "The Pricing Blog" and m.thumb_url == "https://blog.example.com/img/cover.png"
    assert m.embed_url is None
    assert m.article.startswith("Decoy pricing, explained\nA decoy tier") and "nobody reads a pricing table twice" in m.article
    for junk in ("newsletter", "tracking", "Copyright"):
        assert junk not in m.article
    assert len(media.article_text("<p>" + "word " * 20000 + "</p>")) <= 20_000
    pdf = media.metadata("https://example.com/a.pdf", "web", getter({"a.pdf": page(b"%PDF", ctype="application/pdf")}))
    assert pdf.article is None and not pdf.found


def test_json3_captions_become_short_timed_segments():
    data = {"events": [
        {"tStartMs": 0, "dDurationMs": 2000, "segs": [{"utf8": "use"}, {"utf8": " a decoy"}]},
        {"tStartMs": 2000, "dDurationMs": 100, "segs": [{"utf8": "\n"}]},
        {"tStartMs": 2100, "dDurationMs": 1900, "segs": [{"utf8": "tier"}]},
        {"tStartMs": 9000, "dDurationMs": 2000, "segs": [{"utf8": "next idea"}]},
        {"tStartMs": 12000},
    ]}
    assert media.parse_json3(data) == [{"start": 0.0, "end": 4.0, "text": "use a decoy tier"},
                                       {"start": 9.0, "end": 11.0, "text": "next idea"}]
    assert media.parse_json3({}) == [] and media.parse_json3(None) == []


def test_caption_track_prefers_the_creators_subtitles_in_the_videos_language():
    info = {"language": "fr", "subtitles": {"en": [{"ext": "json3", "url": "https://yt/en"}],
                                            "fr": [{"ext": "vtt", "url": "x"}, {"ext": "json3", "url": "https://yt/fr"}]},
            "automatic_captions": {"fr-orig": [{"ext": "json3", "url": "https://yt/auto"}]}}
    assert media.pick_caption_track(info) == ("fr", "https://yt/fr")
    assert media.pick_caption_track({"language": "ar", "automatic_captions": info["automatic_captions"]}) == ("fr", "https://yt/auto")
    assert media.pick_caption_track({}) is None


# --- The guarded fetch --------------------------------------------------------------------

def resolver(mapping):
    def resolve(host, port):
        if host not in mapping:
            raise OSError("unknown host")
        return [(2, 1, 6, "", (ip, 0)) for ip in mapping[host]]
    return resolve


@pytest.mark.parametrize("url", [
    "http://169.254.169.254/latest/meta-data", "http://localhost/x", "http://10.0.0.5/", "http://[::1]/",
    "ftp://example.com/x", "file:///etc/passwd", "https://user:pw@example.com/", "https://example.com:8443/",
    "https://rebind.example/", "https://nowhere.invalid/",
])
def test_private_and_odd_addresses_are_refused(url):
    r = resolver({"localhost": ["127.0.0.1"], "example.com": ["93.184.216.34"], "169.254.169.254": ["169.254.169.254"],
                  "10.0.0.5": ["10.0.0.5"], "::1": ["::1"], "rebind.example": ["93.184.216.34", "10.0.0.1"]})
    with pytest.raises(media.Blocked):
        media.check_url(url, r)
    assert media.check_url("https://example.com/ok", r) == "93.184.216.34"  # the address to connect to


class Stream:
    def __init__(self, status, headers=None, chunks=(), url=""):
        self.status_code, self.headers, self._chunks, self.url = status, headers or {}, chunks, url

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def iter_bytes(self):
        yield from self._chunks


class StreamHttp:
    def __init__(self, replies):
        self.replies, self.seen = list(replies), []

    def stream(self, method, url, headers=None, extensions=None):
        self.seen.append(url)
        self.calls = getattr(self, "calls", []) + [{"url": url, "headers": headers or {}, "extensions": extensions or {}}]
        r = self.replies.pop(0)
        r.url = url
        return r


def test_every_redirect_hop_is_checked_and_the_body_is_capped():
    r = resolver({"example.com": ["93.184.216.34"], "inner.example": ["192.168.1.1"]})
    http = StreamHttp([Stream(302, {"location": "http://inner.example/admin"})])
    with pytest.raises(media.Blocked):
        media.safe_get("https://example.com/a", resolver=r, http=http)
    assert http.seen == ["https://93.184.216.34/a"]  # the private hop was never requested

    http = StreamHttp([Stream(301, {"location": "/b"}), Stream(200, {"Content-Type": "text/html"}, [b"x" * 600, b"y" * 600, b"z" * 600])])
    got = media.safe_get("https://example.com/a", max_bytes=1000, resolver=r, http=http)
    assert got.status == 200 and got.url == "https://example.com/b" and len(got.content) == 600


def test_the_fetch_connects_to_the_address_that_was_checked():
    # DNS rebinding: the name is public when checked and private a moment later. The request must go
    # to the checked address, with the name only in the Host header and as the TLS server name.
    answers = iter([["93.184.216.34"], ["10.0.0.1"], ["10.0.0.1"]])

    def rebinding(host, port):
        return [(2, 1, 6, "", (ip, 0)) for ip in next(answers)]

    http = StreamHttp([Stream(200, {"Content-Type": "text/html"}, [b"ok"])])
    got = media.safe_get("https://rebind.example/path?q=1", resolver=rebinding, http=http, headers={"Host": "evil.example"})
    call = http.calls[0]
    assert call["url"] == "https://93.184.216.34/path?q=1"
    assert call["headers"]["Host"] == "rebind.example"  # a caller cannot override it
    assert call["extensions"] == {"sni_hostname": "rebind.example"}
    assert got.url == "https://rebind.example/path?q=1"  # callers still see the name, never the address
    assert next(answers) == ["10.0.0.1"]  # the name was resolved exactly once

    # Plain http has no TLS name; IPv6 goes in brackets; a second, private answer refuses the whole name.
    http = StreamHttp([Stream(200, {}, [b"ok"])])
    six = resolver({"six.example": ["2606:2800:220:1:248:1893:25c8:1946"]})
    media.safe_get("http://six.example/x", resolver=six, http=http)
    assert http.calls[0]["url"] == "http://[2606:2800:220:1:248:1893:25c8:1946]/x" and http.calls[0]["extensions"] == {}
    assert media.pinned("https://example.com:443/a", "93.184.216.34") == ("https://93.184.216.34:443/a", "example.com:443")
    assert media.check_url("https://both.example/", resolver({"both.example": ["2606:2800:220:1::1", "93.184.216.34"]})) == "93.184.216.34"


def test_the_real_http_client_takes_the_pinned_request(monkeypatch):
    # No fake client here: httpx itself must send to the address in the URL, keep the name in Host
    # and carry it as the TLS server name.
    seen = {}

    def send(self, request, **kw):
        seen.update(url=str(request.url), host=request.headers["host"], sni=request.extensions.get("sni_hostname"))
        return httpx.Response(200, headers={"content-type": "text/html"}, content=b"<title>ok</title>", request=request)

    monkeypatch.setattr(httpx.Client, "send", send)
    got = media.safe_get("https://example.com/a", resolver=resolver({"example.com": ["93.184.216.34"]}),
                         http=httpx.Client(follow_redirects=False))
    assert got.status == 200 and got.url == "https://example.com/a" and b"ok" in got.content
    assert seen == {"url": "https://93.184.216.34/a", "host": "example.com", "sni": "example.com"}


def test_thumbnails_must_be_small_images_and_come_out_as_jpeg():
    buf = io.BytesIO()
    Image.new("RGBA", (1600, 900), (10, 200, 90, 255)).save(buf, "PNG")
    png = buf.getvalue()
    assert media.fetch_image("https://cdn/x", getter({"cdn": page(png, ctype="image/png")})) == png
    assert media.fetch_image("https://cdn/x", getter({"cdn": page(b"<html>", ctype="text/html")})) is None
    assert media.fetch_image("https://cdn/x", getter({"cdn": page(b"x" * (media.THUMB_MAX + 1), ctype="image/jpeg")})) is None
    assert media.fetch_image("https://cdn/x", getter({"cdn": media.Blocked("private")})) is None
    out = Image.open(io.BytesIO(media.to_jpeg(png)))
    assert out.format == "JPEG" and max(out.size) == 720
    assert media.to_jpeg(b"not an image") is None


def test_a_picture_over_40_megapixels_is_refused_before_it_is_decoded(monkeypatch):
    # A tiny file that claims 7000 x 6000 pixels (42 MP): a solid colour compresses to a few kB.
    buf = io.BytesIO()
    Image.new("L", (7000, 6000), 128).save(buf, "PNG", compress_level=9)
    bomb = buf.getvalue()
    assert len(bomb) < media.THUMB_MAX
    decoded = []
    monkeypatch.setattr(Image.Image, "load", lambda self: decoded.append(self.size))
    assert media.to_jpeg(bomb) is None
    assert decoded == []  # refused on the header alone
    monkeypatch.undo()
    buf = io.BytesIO()
    Image.new("L", (6000, 6000), 128).save(buf, "JPEG")  # 36 MP: still allowed
    assert max(Image.open(io.BytesIO(media.to_jpeg(buf.getvalue()))).size) == 720
    # A JPEG header that Pillow cannot decode is no longer passed through as it is.
    assert media.to_jpeg(b"\xff\xd8\xff" + b"junk" * 50) is None


def test_the_download_asks_for_one_progressive_mp4_and_only_from_video_platforms(tmp_path):
    # One file with picture and sound: no "+" (merge) and no "/" fallback to split streams, so no ffmpeg.
    assert media.VIDEO_FORMAT == "best[ext=mp4][vcodec!=?none][acodec!=?none]"
    assert "+" not in media.VIDEO_FORMAT and "/" not in media.VIDEO_FORMAT
    with pytest.raises(media.DownloadFailed):
        media.download("http://169.254.169.254/video.mp4", tmp_path, max_seconds=600, max_bytes=10)


LOOKALIKES = [
    "https://evilinstagram.com/reel/Cxyz_12-AB/", "https://instagram.com.evil.example/reel/Cxyz_12-AB/",
    "https://nottiktok.com/@a/video/7234567890123456789", "https://tiktok.com.evil.example/@a/video/7234567890123456789",
    "https://fakeyoutube.com/watch?v=dQw4w9WgXcQ", "https://evilyoutu.be/dQw4w9WgXcQ",
    "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ", "https://myinstagr.am/p/abcde12",
    "http://169.254.169.254/latest/meta-data", "https://example.com/video.mp4",
]


class FakeYdl:
    """Stands in for yt_dlp.YoutubeDL: records what it was given, never touches the network."""

    made: list["FakeYdl"] = []
    info: dict = {}

    def __init__(self, opts):
        self.opts, self.urls = opts, []
        FakeYdl.made.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def extract_info(self, url, download=False):
        self.urls.append(url)
        if download:
            for hook in self.opts.get("progress_hooks", []):
                hook({"status": "downloading"})
            Path(self.opts["outtmpl"].replace("%(ext)s", "mp4")).write_bytes(b"\x00\x00\x00\x18ftypmp42" + b"v" * 2000)
        return dict(FakeYdl.info)


@pytest.fixture
def ydl(monkeypatch):
    import yt_dlp

    FakeYdl.made, FakeYdl.info = [], {"duration": 20}
    monkeypatch.setattr(yt_dlp, "YoutubeDL", FakeYdl)
    return FakeYdl


@pytest.mark.parametrize("url", LOOKALIKES)
def test_ytdlp_is_never_started_for_a_lookalike_or_other_host(url, tmp_path, ydl):
    assert media.youtube_id(url) is None
    assert media.detect_platform(url) == "web"
    assert media.platform_target(url) is None
    with pytest.raises(media.DownloadFailed):
        media.download(url, tmp_path, max_seconds=600, max_bytes=10_000)
    assert media.youtube_captions(url, get=getter({})) is None
    assert ydl.made == []


@pytest.mark.parametrize("url", [
    "http://www.instagram.com/reel/Cxyz_12-AB/",                  # not https
    "https://user:pw@www.tiktok.com/@a/video/7234567890123456789",  # credentials
    "https://www.instagram.com:8443/reel/Cxyz_12-AB/",            # odd port
    "https://www.youtube.com/playlist?list=PL123",                # no video id
    "https://www.youtube.com/@channel",
])
def test_ytdlp_is_not_started_for_an_odd_address_on_a_real_platform(url, tmp_path, ydl):
    assert media.platform_target(url) is None
    with pytest.raises(media.DownloadFailed):
        media.download(url, tmp_path, max_seconds=600, max_bytes=10_000)
    assert media.youtube_captions(url, get=getter({})) is None
    assert ydl.made == []


def test_youtube_goes_to_ytdlp_as_the_watch_url_built_from_the_id(tmp_path, ydl):
    messy = "https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxyz&index=4&next=https://evil.example/"
    ydl.info = {"duration": 20, "subtitles": {"en": [{"ext": "json3", "url": "https://www.youtube.com/api/timedtext?x"}]}}
    got = media.youtube_captions(messy, get=getter({"timedtext": page(json.dumps({"events": [
        {"tStartMs": 0, "dDurationMs": 1500, "segs": [{"utf8": "hello"}]}]}), ctype="application/json")}))
    assert got["segments"][0]["text"] == "hello"
    captions = ydl.made[0]
    assert captions.urls == ["https://www.youtube.com/watch?v=dQw4w9WgXcQ"]
    assert captions.opts["allowed_extractors"] == ["youtube"]
    assert captions.opts["noplaylist"] is True and captions.opts["playlist_items"] == "1" and captions.opts["skip_download"] is True

    media.download("https://youtu.be/dQw4w9WgXcQ?list=PLxyz", tmp_path, max_seconds=600, max_bytes=10_000)
    video = ydl.made[1]
    assert video.urls == ["https://www.youtube.com/watch?v=dQw4w9WgXcQ"]
    assert video.opts["allowed_extractors"] == ["youtube"] and video.opts["noplaylist"] is True and video.opts["playlist_items"] == "1"


def test_each_platform_gets_only_its_own_extractor(tmp_path, ydl):
    media.download("https://www.instagram.com/reel/Cxyz_12-AB/", tmp_path, max_seconds=600, max_bytes=10_000)
    media.download("https://vm.tiktok.com/ZMabc/", tmp_path, max_seconds=600, max_bytes=10_000)
    assert [(y.urls, y.opts["allowed_extractors"]) for y in ydl.made] == [
        (["https://www.instagram.com/reel/Cxyz_12-AB/"], ["Instagram"]),
        (["https://vm.tiktok.com/ZMabc/"], ["TikTok", r"vm\.tiktok"])]


def test_the_real_ytdlp_refuses_everything_but_the_allowed_extractor():
    # The option really does switch the generic extractor off (no network is needed to find out).
    import yt_dlp

    loaded = {"youtube": ["Youtube"], "instagram": ["Instagram"], "tiktok": ["TikTok", "TikTokVM"]}
    for platform, names in media.EXTRACTORS.items():
        with yt_dlp.YoutubeDL({"allowed_extractors": names, "quiet": True, "logger": media._Quiet()}) as real:
            assert sorted(real._ies) == loaded[platform]
            with pytest.raises(yt_dlp.utils.DownloadError, match="No suitable extractor"):
                real.extract_info("https://example.com/video.mp4", download=False)


def test_a_download_is_stopped_from_its_progress_hook_when_the_run_is_nearly_over(tmp_path, ydl):
    import time

    token = deadline.set_deadline(time.monotonic() + 10)  # less than DOWNLOAD_STOP_S left
    try:
        with pytest.raises(deadline.OutOfTime):
            media.download("https://www.instagram.com/reel/Cxyz_12-AB/", tmp_path, max_seconds=600, max_bytes=10_000)
        assert ydl.made == []  # not even started
    finally:
        deadline.reset(token)

    # Enough time at the start, none left by the first progress report: yt-dlp is cancelled.
    left = iter([100.0, 5.0])
    real_has = deadline.has
    try:
        deadline.has = lambda seconds: next(left) >= seconds
        with pytest.raises(deadline.OutOfTime):
            media.download("https://www.instagram.com/reel/Cxyz_12-AB/", tmp_path, max_seconds=600, max_bytes=10_000)
    finally:
        deadline.has = real_has
    assert len(ydl.made) == 1 and not list(tmp_path.glob("video.*"))


def test_what_ytdlp_learned_fills_the_gaps():
    f = media.info_fields({"description": "Full caption", "title": "Video by chef", "uploader_id": "12345",
                           "uploader": "chef.casa", "duration": 31.4, "thumbnail": "https://t/x.jpg"})
    assert f["caption"] == "Full caption" and f["creator"] == "@chef.casa" and f["duration"] == 31.4
