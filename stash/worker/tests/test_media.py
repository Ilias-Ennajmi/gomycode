"""Metadata, embed players, article text, captions and the guarded fetch. No network, no ffmpeg."""

from __future__ import annotations

import io
import json
import re
from pathlib import Path

import pytest
from PIL import Image

from stash_worker import media
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
    assert media.check_url("https://example.com/ok", r)


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

    def stream(self, method, url, headers=None):
        self.seen.append(url)
        r = self.replies.pop(0)
        r.url = url
        return r


def test_every_redirect_hop_is_checked_and_the_body_is_capped():
    r = resolver({"example.com": ["93.184.216.34"], "inner.example": ["192.168.1.1"]})
    http = StreamHttp([Stream(302, {"location": "http://inner.example/admin"})])
    with pytest.raises(media.Blocked):
        media.safe_get("https://example.com/a", resolver=r, http=http)
    assert http.seen == ["https://example.com/a"]  # the private hop was never requested

    http = StreamHttp([Stream(301, {"location": "/b"}), Stream(200, {"Content-Type": "text/html"}, [b"x" * 600, b"y" * 600, b"z" * 600])])
    got = media.safe_get("https://example.com/a", max_bytes=1000, resolver=r, http=http)
    assert got.status == 200 and got.url == "https://example.com/b" and len(got.content) == 600


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


def test_the_download_asks_for_one_progressive_mp4_and_only_from_video_platforms(tmp_path):
    # One file with picture and sound: no "+" (merge) and no "/" fallback to split streams, so no ffmpeg.
    assert media.VIDEO_FORMAT == "best[ext=mp4][vcodec!=?none][acodec!=?none]"
    assert "+" not in media.VIDEO_FORMAT and "/" not in media.VIDEO_FORMAT
    with pytest.raises(media.DownloadFailed):
        media.download("http://169.254.169.254/video.mp4", tmp_path, max_seconds=600, max_bytes=10)


def test_what_ytdlp_learned_fills_the_gaps():
    f = media.info_fields({"description": "Full caption", "title": "Video by chef", "uploader_id": "12345",
                           "uploader": "chef.casa", "duration": 31.4, "thumbnail": "https://t/x.jpg"})
    assert f["caption"] == "Full caption" and f["creator"] == "@chef.casa" and f["duration"] == 31.4
