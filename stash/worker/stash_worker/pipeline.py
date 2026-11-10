"""One job at a time. A save: metadata → video → transcript → insights → embedding → ready.

Contract: docs/CONTRACT_0007.md. The rules that shape this file:

* A save always ends `ready`. A blocked download, a missing AI key, a budget that ran out or a
  provider error never fails it; only an unexpected exception retries the job.
* Title and thumbnail are written (one PATCH) before the download starts.
* `video_path`, `video_bytes`, `video_state` and `playback` change together in one PATCH
  (the database checks they agree).
* AI and video storage are for owners only (`worker_config().owner_ids`), under the monthly budget.
"""

from __future__ import annotations

import logging
import shutil
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from . import ai, exports, galaxy, geocode, media
from .config import EMBED_MODEL, Config
from .proxy import ProxyError, vector_literal
from .rules import (SCREENSHOT_MIME, choose_space, decide_playback, detect_platform, embedding_text, is_owner,
                    place_highlights, screenshot_path, segments_text, sm2)

log = logging.getLogger("stash.worker")

HARD_LIMIT_S = 285          # the function is killed at 300 s
DOWNLOAD_NEEDS_S = 60       # don't start a video download with less than this left
TRASH_BATCH = 50
VIDEO_PLATFORMS = ("instagram", "tiktok")
AI_ERRORS = (ai.InsightError, ai.ProviderError, ai.NoProvider)


class ScreenshotMissing(Exception):
    """A screenshot save whose image isn't in Storage (upload never landed, or a bad reference)."""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _month_start() -> datetime:
    n = datetime.now(timezone.utc)
    return n.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def month_spend(supa: Any, user_id: str) -> float:
    rows = supa.select("usage", {"select": "usd", "user_id": f"eq.{user_id}",
                                 "created_at": f"gte.{_month_start().isoformat()}"})
    return sum(float(r.get("usd") or 0) for r in rows)


def _budget(supa: Any, user_id: str) -> float:
    row = supa.one("settings", {"select": "monthly_budget_usd", "user_id": f"eq.{user_id}"})
    return float((row or {}).get("monthly_budget_usd") or 5)


USAGE_DEFAULTS = {"save_id": None, "provider": None, "input_tokens": 0, "output_tokens": 0, "audio_seconds": 0, "usd": 0}


def _log_usage(supa: Any, rows: list[dict[str, Any]]) -> None:
    # A bulk insert needs every row to carry the same keys (PostgREST rejects mixed shapes).
    if rows:
        supa.insert("usage", [{**USAGE_DEFAULTS, **r} for r in rows])


def _usage(result: Any, **row: Any) -> dict[str, Any]:
    """A usage row from any ai.* result object."""
    return {**row, "provider": getattr(result, "provider", None) or None,
            "input_tokens": getattr(result, "input_tokens", 0), "output_tokens": getattr(result, "output_tokens", 0),
            "usd": getattr(result, "usd", 0)}


def _failed_usage(exc: Exception, **row: Any) -> list[dict[str, Any]]:
    """An unusable answer is still billed: its tokens go to the cost guard."""
    tokens = getattr(exc, "tokens", None)
    if not tokens or not (tokens[0] or tokens[1]):
        return []
    return [{**row, "provider": getattr(exc, "provider", None), "input_tokens": tokens[0], "output_tokens": tokens[1],
             "usd": getattr(exc, "usd", 0)}]


def _spaces(supa: Any, user_id: str) -> tuple[dict[str, str], str | None]:
    rows = supa.select("spaces", {"select": "id,name,kind", "user_id": f"eq.{user_id}", "archived": "eq.false"})
    names = {r["name"].strip().lower(): r["id"] for r in rows if r["kind"] != "inbox"}
    inbox = next((r["id"] for r in rows if r["kind"] == "inbox"), None)
    return names, inbox


def _finish_job(supa: Any, job: dict[str, Any], state: str, error: str | None = None, run_after: str | None = None) -> None:
    values: dict[str, Any] = {"state": state, "error": error, "locked_at": None}
    if run_after:
        values["run_after"] = run_after
    supa.update("jobs", {"id": f"eq.{job['id']}"}, values)


def _gate(supa: Any, cfg: Config, user_id: str) -> str | None:
    """Owner gating + cost guard for every job type. Returns the refusal reason, or None."""
    if not is_owner(user_id, cfg.owner_user_ids):
        return "not_owner"
    if month_spend(supa, user_id) >= _budget(supa, user_id):
        return "budget"
    return None


def owner_mismatch(job: dict[str, Any], row_user_id: Any) -> bool:
    """True when the job's user isn't the owner of the row it points at (or either is unknown).

    The database refuses cross-owner references, but the worker checks again before spending
    anything: a job may only touch its own user's saves, Spaces, cards, exports and asks."""
    job_user = job.get("user_id")
    return not job_user or not row_user_id or str(job_user) != str(row_user_id)


def _refuse_mismatch(supa: Any, job: dict[str, Any]) -> str:
    log.warning("job refused: owner_mismatch")
    _finish_job(supa, job, "failed", "owner_mismatch")
    return "owner_mismatch"


def _retry_or_fail(supa: Any, job: dict[str, Any], exc: Exception) -> str:
    reason = type(exc).__name__
    log.warning("job failed: %s", reason)
    if job.get("attempts", 1) < 3:
        retry_at = (datetime.now(timezone.utc) + timedelta(minutes=2 ** job.get("attempts", 1))).isoformat()
        _finish_job(supa, job, "queued", reason, run_after=retry_at)
        return "retry"
    _finish_job(supa, job, "failed", reason)
    return "failed"


def process_job(supa: Any, cfg: Config, job: dict[str, Any], deadline: float | None = None) -> str:
    """Returns a short outcome word for the run summary (never user data)."""
    kind = job["type"]
    if kind == "grade":
        return process_grade(supa, cfg, job)
    if kind == "synthesize":
        return process_synthesize(supa, cfg, job)
    if kind == "export":
        return exports.process_export(supa, cfg, job)
    if kind in ("galaxy", "ask", "backup"):
        from . import ask, backup  # late: they import this module

        handler = {"galaxy": lambda: galaxy.process_galaxy(supa, cfg, job, _gate),
                   "ask": lambda: ask.process_ask(supa, cfg, job),
                   "backup": lambda: backup.process_backup(supa, cfg, job)}[kind]
        try:
            return handler()
        except Exception as exc:  # noqa: BLE001 — back off and retry like the other job types
            return _retry_or_fail(supa, job, exc)
    if kind not in ("ingest", "reprocess"):
        _finish_job(supa, job, "failed", "unknown job type")
        return "skipped"

    save = supa.one("saves", {"select": "*", "id": f"eq.{job['save_id']}"})
    if not save:
        _finish_job(supa, job, "done")
        return "gone"
    if owner_mismatch(job, save["user_id"]):
        return _refuse_mismatch(supa, job)  # the save isn't touched: it belongs to someone else

    match = {"id": f"eq.{save['id']}"}
    insights_only = kind == "reprocess" and (job.get("payload") or {}).get("mode") == "insights"
    workdir = Path(tempfile.mkdtemp(prefix="stash-"))
    try:
        outcome = _ingest(supa, cfg, save, workdir, insights_only=insights_only, deadline=deadline)
        _finish_job(supa, job, "done")
        return outcome
    except media.DeadLink:
        supa.update("saves", match, {"status": "dead_link", "process_step": "ready", "processed_at": _now()})
        _finish_job(supa, job, "done", "dead_link")
        return "dead_link"
    except ScreenshotMissing as exc:
        _finish_job(supa, job, "failed", str(exc))
        supa.update("saves", match, {"status": "failed", "process_step": "ready",
                                     "error": "The screenshot didn't arrive. Share it to Stash again."})
        return "failed"
    except Exception as exc:  # noqa: BLE001 — report, back off, retry
        reason = type(exc).__name__
        log.warning("job failed: %s", reason)
        if job.get("attempts", 1) < 3:
            retry_at = (datetime.now(timezone.utc) + timedelta(minutes=2 ** job.get("attempts", 1))).isoformat()
            _finish_job(supa, job, "queued", reason, run_after=retry_at)
            if not insights_only:
                supa.update("saves", match, {"status": "queued", "process_step": "queued", "error": None})
            return "retry"
        _finish_job(supa, job, "failed", reason)
        if not insights_only:
            supa.update("saves", match, {"status": "failed", "process_step": "ready",
                                         "error": "Processing failed. Tap Retry."})
        return "failed"
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


# --- Ingest ---------------------------------------------------------------------------------

def _store_thumb(supa: Any, user_id: str, save_id: str, thumb_url: str | None) -> str | None:
    """The platform's image → stash-thumbs/<uid>/<save_id>.jpg. None when it can't be had."""
    if not thumb_url:
        return None
    try:
        raw = media.fetch_image(thumb_url)
        jpeg = media.to_jpeg(raw) if raw else None
        if not jpeg:
            return None
        path = f"{user_id}/{save_id}.jpg"
        supa.upload("stash-thumbs", path, jpeg, "image/jpeg")
        return path
    except Exception:  # noqa: BLE001 — a missing thumbnail must not stop the save
        return None


def _ingest(supa: Any, cfg: Config, save: dict[str, Any], workdir: Path, *, insights_only: bool = False,
            deadline: float | None = None) -> str:
    save_id, user_id = save["id"], save["user_id"]
    match = {"id": f"eq.{save_id}"}
    url = save["source_url"]
    # The platform comes from the address itself, not from what the phone wrote in the row.
    platform = "screenshot" if str(url).startswith("screenshot:") else detect_platform(url)
    owner = is_owner(user_id, cfg.owner_user_ids)
    over_budget = owner and month_spend(supa, user_id) >= _budget(supa, user_id)
    may_spend = owner and not over_budget
    usage: list[dict[str, Any]] = []

    title, caption, creator = save.get("title"), save.get("caption"), save.get("creator_handle")
    duration = save.get("duration_s")
    stored = bool(save.get("video_path"))
    local_video: Path | None = None
    image: bytes | None = None
    image_mime = "image/jpeg"
    article: str | None = None
    yt_info: dict[str, Any] | None = None

    def step(name: str) -> None:
        if not insights_only:
            supa.update("saves", match, {"process_step": name})

    # 1 · Fetching: metadata first, then the video -------------------------------------------
    if platform == "screenshot":
        path = screenshot_path(url, user_id)
        if not path:
            raise ScreenshotMissing("bad screenshot reference")
        if not insights_only:
            supa.update("saves", match, {"status": "processing", "process_step": "fetching", "error": None})
        try:
            image = supa.download("stash-thumbs", path)
        except Exception as exc:  # noqa: BLE001 — the upload never landed
            raise ScreenshotMissing("screenshot not in storage") from exc
        if not image:
            raise ScreenshotMissing("empty screenshot")
        image_mime = SCREENSHOT_MIME[path.rsplit(".", 1)[1]]
        if not insights_only:  # the screenshot is its own thumbnail
            supa.update("saves", match, {"thumb_path": path, "playback": "none", "embed_url": None})
    elif not insights_only:
        supa.update("saves", match, {"status": "processing", "process_step": "fetching", "error": None})
        meta = media.metadata(url, platform)  # DeadLink ends the job as dead_link
        article = meta.article
        title, caption = meta.title or title, meta.caption or caption
        creator, duration = meta.creator or creator, meta.duration or duration
        embed_url = meta.embed_url or save.get("embed_url")
        patch: dict[str, Any] = {"title": title, "creator_handle": creator, "caption": caption,
                                 "duration_s": duration, "embed_url": embed_url}
        if save.get("platform") != platform:
            patch["platform"] = platform
        thumb = _store_thumb(supa, user_id, save_id, meta.thumb_url) or save.get("thumb_path")
        if thumb:
            patch["thumb_path"] = thumb
        if not stored:  # provisional: what Play shows while (or instead of) the download
            patch["playback"] = decide_playback(platform, save.get("video_state") or "none", embed_url)
        supa.update("saves", match, patch)  # one PATCH: the card gets its title and picture here
        if meta.canonical_url and meta.canonical_url != url and platform == "tiktok":
            try:  # short links become the post's own address ("Open in TikTok" works later)
                supa.update("saves", match, {"source_url": meta.canonical_url})
                url = meta.canonical_url
            except ProxyError:
                pass

        # The video: owners only; YouTube only when switched on.
        wants_video = owner and (platform in VIDEO_PLATFORMS or (platform == "youtube" and cfg.youtube_download))
        has_time = deadline is None or deadline - time.monotonic() > DOWNLOAD_NEEDS_S
        if wants_video and not stored and has_time:
            state = "blocked"
            try:
                got = media.download(url, workdir, max_seconds=cfg.max_video_seconds, max_bytes=cfg.video_max_bytes,
                                     cookies_b64=cfg.ig_cookies_b64 if platform == "instagram" else "")
                local_video = got.path
                yt_info = got.info
                key = f"{user_id}/{save_id}.mp4"
                try:
                    supa.rpc("evict_videos", {"p_incoming_bytes": got.size})  # make room first
                    supa.upload("stash-video", key, got.path, "video/mp4")
                    supa.update("saves", match, {"video_path": key, "video_bytes": got.size,
                                                 "video_state": "stored", "playback": "video"})
                    stored, state = True, "stored"
                except ProxyError as exc:  # storage trouble: the video still feeds the transcript
                    log.warning("video not stored: %s", exc)
                    state = "none"
            except media.TooBig:
                state = "too_big"
            except media.DownloadFailed as exc:
                log.info("download refused: %s", exc)
            if state != "stored":
                supa.update("saves", match, {"video_state": state,
                                             "playback": decide_playback(platform, state, embed_url)})
        if yt_info:  # what the download learned that the page didn't say (Instagram mostly)
            extra = media.info_fields(yt_info)
            more: dict[str, Any] = {}
            if not caption and extra["caption"]:
                caption = more["caption"] = extra["caption"]
            if not title and (extra["title"] or caption):
                title = more["title"] = extra["title"] or media._short_title(caption)
            if not creator and extra["creator"]:
                creator = more["creator_handle"] = extra["creator"]
            if extra["duration"]:
                duration = more["duration_s"] = round(float(extra["duration"]), 1)
            if not thumb:
                late = _store_thumb(supa, user_id, save_id, extra["thumb_url"])
                if late:
                    more["thumb_path"] = late
            if more:
                supa.update("saves", match, more)

    # 2 · Watching: the transcript (or the picture, or the article) -------------------------------
    step("watching")
    existing = supa.one("transcripts", {"select": "segments,full_text", "save_id": f"eq.{save_id}"}) or {}
    segments: list[dict[str, Any]] = existing.get("segments") or []
    transcript_text = segments_text(segments) or (existing.get("full_text") or "")
    visual: str | None = None
    vision: ai.Understanding | None = None
    ai_state = "not_owner" if not owner else "over_budget" if over_budget else None if cfg.has_ai else "no_key"

    if platform == "screenshot":
        if ai_state is None and image:
            try:
                names, _ = _spaces(supa, user_id)
                vision = ai.read_screenshot(cfg, image=image, media_type=image_mime, space_names=names,
                                            user_note=save.get("user_note"))
                v = vision.insights
                caption, creator = v.get("caption_text") or caption, v.get("creator") or creator
                title = v.get("what_it_is") or title
                supa.update("saves", match, {"caption": caption, "creator_handle": creator, "title": title})
            except AI_ERRORS as exc:
                log.warning("vision failed: %s", exc)
                usage += _failed_usage(exc, user_id=user_id, save_id=save_id, kind="vision")
                ai_state = "failed"
    elif platform == "web":
        if article and article != existing.get("full_text"):
            transcript_text = article
            supa.insert("transcripts", {"save_id": save_id, "user_id": user_id, "segments": [],
                                        "full_text": article}, upsert_on="save_id")
    elif not transcript_text:
        tr: ai.Transcript | None = None
        if platform == "youtube":  # the platform's own captions: free, and no AI key needed
            got_captions = media.youtube_captions(url)
            if got_captions:
                yt_info = got_captions.get("info") or yt_info
                if got_captions["segments"]:
                    tr = ai.Transcript(got_captions["segments"], segments_text(got_captions["segments"]),
                                       got_captions.get("language"), 0.0, provider="youtube")
                if not insights_only and yt_info:
                    extra = media.info_fields(yt_info)
                    more = {}
                    if not caption and extra["caption"]:
                        caption = more["caption"] = extra["caption"][:5000]
                    if extra["duration"]:
                        duration = more["duration_s"] = round(float(extra["duration"]), 1)
                    if more:
                        supa.update("saves", match, more)
        if tr is None and may_spend and cfg.transcribe_provider:
            try:
                if local_video is None and stored and save.get("video_path", "").startswith(f"{user_id}/"):
                    local_video = workdir / "stored.mp4"  # an earlier run stored it: no new download
                    local_video.write_bytes(supa.download("stash-video", save["video_path"]))
                if local_video is not None:
                    tr = ai.transcribe(cfg, local_video, "video/mp4", float(duration or 0))
                elif platform == "youtube" and 0 < float(duration or 0) <= cfg.max_video_seconds:
                    tr = ai.transcribe_url(cfg, url, float(duration or 0))
            except AI_ERRORS + (ProxyError,) as exc:  # no transcript: the caption still gives insights
                log.warning("transcription failed: %s", exc)
                usage += _failed_usage(exc, user_id=user_id, save_id=save_id, kind="transcribe")
        if tr is not None:
            segments, transcript_text, visual = tr.segments, tr.text, tr.visual
            if segments:
                supa.insert("transcripts", {"save_id": save_id, "user_id": user_id, "segments": segments,
                                            "full_text": tr.text}, upsert_on="save_id")
            if tr.provider != "youtube":
                usage.append(_usage(tr, user_id=user_id, save_id=save_id, kind="transcribe",
                                    audio_seconds=round(tr.seconds, 1)))

    # 3 · Reading: insights from whatever exists ---------------------------------------------------
    step("reading")
    insights: dict[str, Any] | None = None
    if ai_state is None:
        if vision is None and not any((transcript_text, caption, title, visual)):
            ai_state = "failed"  # nothing to read: better no summary than an invented one
        else:
            names, inbox_id = _spaces(supa, user_id)
            try:
                u = vision or ai.understand(cfg, platform=platform, creator=creator, title=title, caption=caption,
                                            transcript=transcript_text, space_names=names,
                                            user_note=save.get("user_note"), visual=visual)
            except AI_ERRORS as exc:
                log.warning("insights failed: %s", exc)
                usage += _failed_usage(exc, user_id=user_id, save_id=save_id, kind="understand")
                ai_state = "failed"
            else:
                insights = u.insights
                usage.append(_usage(u, user_id=user_id, save_id=save_id, kind="vision" if vision else "understand"))
                _file_insights(supa, cfg, save, insights, inbox_id, segments, caption, transcript_text)
                ai_state = "done"

    # 4 · Filing: the embedding (needs no AI key) -----------------------------------------------------
    step("filing")
    text = embedding_text(insights, caption, transcript_text, title)
    if text.strip():
        try:
            vector = supa.embed([text])[0]
            supa.insert("embeddings", {"save_id": save_id, "user_id": user_id, "vector": vector_literal(vector),
                                       "model": EMBED_MODEL}, upsert_on="save_id")
            usage.append({"user_id": user_id, "save_id": save_id, "kind": "embed", "provider": "supabase"})
        except ProxyError as exc:  # search by words still works; the next reprocess embeds it
            log.warning("embedding failed: %s", exc)

    _log_usage(supa, usage)
    if insights_only:
        supa.update("saves", match, {"ai_state": ai_state})
    else:
        supa.update("saves", match, {"status": "ready", "process_step": "ready", "processed_at": _now(),
                                     "ai_state": ai_state, "error": None})
    return "ready"


def _file_insights(supa: Any, cfg: Config, save: dict[str, Any], insights: dict[str, Any], inbox_id: str | None,
                   segments: list[dict[str, Any]], caption: str | None, transcript_text: str) -> None:
    save_id, user_id = save["id"], save["user_id"]
    supa.insert("insights", {
        "save_id": save_id, "user_id": user_id,
        **{k: insights[k] for k in ("title", "key_idea", "takeaways", "actions", "intent", "tags",
                                    "language", "suggested_space_id", "confidence")},
    }, upsert_on="save_id")

    # Only file saves nobody has filed: the owner may have picked a Space while this job ran.
    if not save.get("space_id"):
        space_id = choose_space(None, insights["suggested_space_id"], insights["confidence"], inbox_id)
        if space_id:
            supa.update("saves", {"id": f"eq.{save_id}", "space_id": "is.null"}, {"space_id": space_id})

    supa.delete("places", {"save_id": f"eq.{save_id}"})
    if insights["places"]:
        supa.insert("places", [{"save_id": save_id, "user_id": user_id, **p} for p in insights["places"]])
        try:
            geocode.geocode_save(supa, cfg, save_id)  # pins for the Map and "nearby" reminders
        except Exception:  # noqa: BLE001 — a missing pin never fails a save
            pass

    if insights["cards"] and not supa.one("cards", {"select": "id", "save_id": f"eq.{save_id}"}):
        due = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
        supa.insert("cards", [{"save_id": save_id, "user_id": user_id, "due_at": due, **c}
                              for c in insights["cards"]])

    # Up to 3 highlights, only lines that really are in the source. The owner's own are never touched.
    found = place_highlights(insights.get("highlights") or [], segments, caption, transcript_text)
    supa.delete("highlights", {"save_id": f"eq.{save_id}", "source": "eq.ai", "card_id": "is.null"})
    if found:
        supa.insert("highlights", [{"save_id": save_id, "user_id": user_id, "source": "ai", **h} for h in found])


# --- Recall grading ------------------------------------------------------------------------

AUDIO_MIME = {".webm": "audio/webm", ".ogg": "audio/ogg", ".m4a": "audio/mp4", ".mp4": "audio/mp4", ".mp3": "audio/mpeg"}


def process_grade(supa: Any, cfg: Config, job: dict[str, Any]) -> str:
    """payload {card_id, audio_path | text}: transcribe the voice note, grade (fast model), write the
    review, and move the card on with SM-2 unless the owner already graded it themselves."""
    payload = job.get("payload") or {}
    card = supa.one("cards", {"select": "*", "id": f"eq.{payload.get('card_id')}"})
    if not card:
        _finish_job(supa, job, "done", "card gone")
        return "gone"
    user_id = card["user_id"]
    if owner_mismatch(job, user_id):
        return _refuse_mismatch(supa, job)
    refused = _gate(supa, cfg, user_id)
    if refused:
        _finish_job(supa, job, "failed", refused)
        return refused
    if not cfg.has_ai:
        _finish_job(supa, job, "failed", "ai_off")
        return "ai_off"

    audio_path = payload.get("audio_path")
    answer = str(payload.get("text") or "").strip()[:2000]
    usage: list[dict[str, Any]] = []
    row = {"user_id": user_id, "save_id": card["save_id"]}
    try:
        if audio_path:
            # Only the owner's own answers folder (the phone wrote the path).
            if not isinstance(audio_path, str) or not audio_path.startswith(f"{user_id}/answers/") or ".." in audio_path:
                _finish_job(supa, job, "failed", "bad_path")
                return "failed"
            if not cfg.transcribe_provider:
                _finish_job(supa, job, "failed", "no_transcription")
                return "no_transcription"
            workdir = Path(tempfile.mkdtemp(prefix="stash-grade-"))
            try:
                suffix = Path(audio_path).suffix.lower() or ".webm"
                local = workdir / f"answer{suffix}"
                local.write_bytes(supa.download("stash-voice", audio_path))
                tr = ai.transcribe(cfg, local, AUDIO_MIME.get(suffix, "audio/webm"))
            finally:
                shutil.rmtree(workdir, ignore_errors=True)
            if tr:
                answer = tr.text.strip()[:2000]
                usage.append(_usage(tr, **row, kind="transcribe", audio_seconds=round(tr.seconds, 1)))

        insight = supa.one("insights", {"select": "key_idea", "save_id": f"eq.{card['save_id']}"}) or {}
        try:
            g = ai.grade_answer(cfg, question=card["prompt"], expected=card["answer"],
                                key_idea=insight.get("key_idea"), answer=answer)
        except ai.InsightError as exc:
            _log_usage(supa, usage + _failed_usage(exc, **row, kind="grade"))
            _finish_job(supa, job, "failed", "unusable_answer")
            return "failed"
        usage.append(_usage(g, **row, kind="grade"))

        supa.insert("reviews", {"card_id": card["id"], "user_id": user_id, "grade": g.grade,
                                "voice_answer_text": answer or None, "feedback": g.feedback or None,
                                "answered_at": _now()})
        # The owner may have tapped Got it / Partly / Missed while this ran: then the card has moved on already.
        due = card.get("due_at")
        if not due or datetime.fromisoformat(str(due).replace("Z", "+00:00")) <= datetime.now(timezone.utc):
            ease, interval, reps = sm2(card.get("ease") or 2.5, card.get("interval_days") or 0,
                                       card.get("repetitions") or 0, g.grade)
            # Conditional on the due_at we read: a self-grade that lands meanwhile moves due_at,
            # and then this update matches nothing (the hand grade wins).
            match = {"id": f"eq.{card['id']}"}
            if due:
                match["due_at"] = f"eq.{due}"
            supa.update("cards", match, {
                "ease": ease, "interval_days": interval, "repetitions": reps,
                "due_at": (datetime.now(timezone.utc) + timedelta(days=interval)).isoformat()})
        _log_usage(supa, usage)
        if audio_path:
            try:
                supa.remove("stash-voice", [audio_path])  # the transcript is kept in the review
            except Exception:  # noqa: BLE001 — left for the owner's storage, harmless
                pass
        _finish_job(supa, job, "done")
        return "graded"
    except Exception as exc:  # noqa: BLE001
        _log_usage(supa, usage)
        return _retry_or_fail(supa, job, exc)


# --- Syntheses ------------------------------------------------------------------------------

MIN_SYNTH_SAVES = 3
MAX_SYNTH_SAVES = 30


def _one(v: Any) -> dict[str, Any]:
    if isinstance(v, list):
        return v[0] if v else {}
    return v or {}


def process_synthesize(supa: Any, cfg: Config, job: dict[str, Any]) -> str:
    """A Space's (or a tag's) ready saves → points of agreement, disagreements (with save ids), one action."""
    tag = str((job.get("payload") or {}).get("tag") or "").strip().lower()[:60]
    if job.get("space_id"):
        tag = ""
        space = supa.one("spaces", {"select": "id,name,user_id", "id": f"eq.{job['space_id']}"})
        if not space:
            _finish_job(supa, job, "done", "space gone")
            return "gone"
        user_id = space["user_id"]
        if owner_mismatch(job, user_id):
            return _refuse_mismatch(supa, job)
    elif tag and job.get("user_id"):
        space, user_id = None, job["user_id"]
    else:
        _finish_job(supa, job, "done", "space gone")
        return "gone"
    refused = _gate(supa, cfg, user_id)
    if refused:
        _finish_job(supa, job, "failed", refused)
        return refused
    if not cfg.has_ai:
        _finish_job(supa, job, "failed", "ai_off")
        return "ai_off"

    params = {"select": "id,insights(title,key_idea,takeaways,tags)", "user_id": f"eq.{user_id}",
              "status": "eq.ready", "order": "processed_at.desc.nullslast"}
    if space:
        rows = supa.select("saves", {**params, "space_id": f"eq.{space['id']}", "limit": str(MAX_SYNTH_SAVES)})
    else:  # the user's own saves only (user_id filter), matched on the tag case-insensitively
        rows = supa.select("saves", {**params, "limit": "400"})
    saves = []
    for r in rows:
        ins = _one(r.get("insights"))
        if not ins.get("key_idea"):
            continue
        if tag and tag not in {str(t).strip().lower() for t in ins.get("tags") or []}:
            continue
        saves.append({"id": r["id"], "title": ins.get("title"), "key_idea": ins["key_idea"],
                      "takeaways": ins.get("takeaways") or []})
    saves = saves[:MAX_SYNTH_SAVES]
    if len(saves) < MIN_SYNTH_SAVES:
        _finish_job(supa, job, "done", "too_few")
        return "too_few"

    try:
        s = ai.synthesize(cfg, space_name=space["name"] if space else tag, saves=saves,
                          kind="Space" if space else "Tag")
    except ai.InsightError as exc:
        _log_usage(supa, _failed_usage(exc, user_id=user_id, kind="synthesize"))
        _finish_job(supa, job, "failed", "unusable_answer")
        return "failed"
    except Exception as exc:  # noqa: BLE001
        return _retry_or_fail(supa, job, exc)

    supa.insert("syntheses", {"space_id": space["id"] if space else None, "tag": tag or None, "user_id": user_id,
                              **s.value, "source_save_ids": [x["id"] for x in saves]})
    _log_usage(supa, [_usage(s, user_id=user_id, kind="synthesize")])
    _finish_job(supa, job, "done")
    return "synthesized"


# --- Trash and the run loop -------------------------------------------------------------------

def empty_trash(supa: Any, cfg: Config | None = None, limit: int = TRASH_BATCH) -> int:
    """Deletes up to `limit` files queued by the database (deleted saves, evicted videos, old backups)."""
    rows = supa.select("media_trash", {"select": "id,store,bucket,path", "order": "id", "limit": str(limit)})
    if not rows:
        return 0
    by_bucket: dict[str, list[str]] = {}
    for r in rows:  # rows with store "r2" predate 0007: nothing was ever stored there
        if r["store"] == "storage" and r.get("bucket"):
            by_bucket.setdefault(r["bucket"], []).append(r["path"])
    for bucket, paths in by_bucket.items():
        supa.remove(bucket, paths)
    done = [str(r["id"]) for r in rows]
    supa.delete("media_trash", {"id": f"in.({','.join(done)})"})
    return len(done)


FAILED = {"failed", "owner_mismatch", "not_owner", "budget", "ai_off", "no_transcription", "unknown_kind",
          "skipped", "error"}


def run(supa: Any, cfg: Config, clock=time.monotonic) -> dict[str, int]:
    """Claims and processes jobs until the queue is empty or the time budget is spent, then empties the trash.

    Returns {"done", "failed", "requeued", "trashed"}: counts only, never user data."""
    started = clock()
    deadline = started + HARD_LIMIT_S
    summary = {"done": 0, "failed": 0, "requeued": 0, "trashed": 0}
    while clock() - started < cfg.run_budget_seconds:
        jobs = supa.rpc("claim_jobs", {"p_limit": 1}) or []
        if not jobs:
            break
        for job in jobs:
            try:
                outcome = process_job(supa, cfg, job, deadline=deadline)
            except Exception as exc:  # noqa: BLE001 — one bad job never stops the run
                try:
                    outcome = _retry_or_fail(supa, job, exc)
                except Exception:  # noqa: BLE001 — the sweep re-queues a stuck job
                    outcome = "error"
            key = "requeued" if outcome == "retry" else "failed" if outcome in FAILED else "done"
            summary[key] += 1
    try:
        summary["trashed"] = empty_trash(supa, cfg)
    except Exception:  # noqa: BLE001 — cleanup retries on the next sweep
        pass
    return summary
