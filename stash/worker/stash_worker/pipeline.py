"""One job at a time: fetch → transcribe → understand → file → embed → ready."""

from __future__ import annotations

import logging
import shutil
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from . import ai, media, r2
from .config import Config
from .rules import choose_space, detect_platform, embedding_text, is_owner, segments_text
from .supa import Supa

log = logging.getLogger("stash.worker")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _month_start() -> datetime:
    n = datetime.now(timezone.utc)
    return n.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def month_spend(supa: Supa, user_id: str) -> float:
    rows = supa.select("usage", {"select": "usd", "user_id": f"eq.{user_id}",
                                 "created_at": f"gte.{_month_start().isoformat()}"})
    return sum(float(r.get("usd") or 0) for r in rows)


def _budget(supa: Supa, user_id: str) -> float:
    row = supa.one("settings", {"select": "monthly_budget_usd", "user_id": f"eq.{user_id}"})
    return float((row or {}).get("monthly_budget_usd") or 5)


USAGE_DEFAULTS = {"save_id": None, "input_tokens": 0, "output_tokens": 0, "audio_seconds": 0, "usd": 0}


def _log_usage(supa: Supa, rows: list[dict[str, Any]]) -> None:
    # A bulk insert needs every row to carry the same keys (PostgREST rejects mixed shapes).
    if rows:
        supa.insert("usage", [{**USAGE_DEFAULTS, **r} for r in rows])


def _spaces(supa: Supa, user_id: str) -> tuple[dict[str, str], str | None]:
    rows = supa.select("spaces", {"select": "id,name,kind", "user_id": f"eq.{user_id}", "archived": "eq.false"})
    names = {r["name"].strip().lower(): r["id"] for r in rows if r["kind"] != "inbox"}
    inbox = next((r["id"] for r in rows if r["kind"] == "inbox"), None)
    return names, inbox


def _finish_job(supa: Supa, job: dict[str, Any], state: str, error: str | None = None, run_after: str | None = None) -> None:
    values: dict[str, Any] = {"state": state, "error": error, "locked_at": None}
    if run_after:
        values["run_after"] = run_after
    supa.update("jobs", {"id": f"eq.{job['id']}"}, values)


def process_job(supa: Supa, cfg: Config, job: dict[str, Any]) -> str:
    """Returns a short outcome word for the run summary (never user data)."""
    if job["type"] not in ("ingest", "reprocess"):
        _finish_job(supa, job, "failed", "job type arrives in a later phase")
        return "skipped"

    save = supa.one("saves", {"select": "*", "id": f"eq.{job['save_id']}"})
    if not save:
        _finish_job(supa, job, "done")
        return "gone"

    user_id = save["user_id"]
    if not is_owner(user_id, cfg.owner_user_ids):
        _finish_job(supa, job, "failed", "not_owner")
        supa.update("saves", {"id": f"eq.{save['id']}"},
                    {"error": "This device isn't allowed to use the AI yet (add its id to OWNER_USER_IDS)."})
        return "not_owner"

    if month_spend(supa, user_id) >= _budget(supa, user_id):
        _finish_job(supa, job, "failed", "budget")
        supa.update("saves", {"id": f"eq.{save['id']}"},
                    {"status": "failed", "error": "Monthly AI budget reached. Raise it in Settings, then tap Retry."})
        return "budget"

    supa.update("saves", {"id": f"eq.{save['id']}"}, {"status": "processing", "error": None})
    workdir = Path(tempfile.mkdtemp(prefix="stash-"))
    try:
        outcome = _ingest(supa, cfg, save, workdir)
        _finish_job(supa, job, "done")
        return outcome
    except media.DeadLink:
        supa.update("saves", {"id": f"eq.{save['id']}"}, {"status": "dead_link", "processed_at": _now()})
        _finish_job(supa, job, "done", "dead_link")
        return "dead_link"
    except Exception as exc:  # noqa: BLE001 — report, back off, retry
        reason = type(exc).__name__
        log.warning("job failed: %s", reason)
        if job.get("attempts", 1) < 3:
            retry_at = (datetime.now(timezone.utc) + timedelta(minutes=2 ** job.get("attempts", 1))).isoformat()
            _finish_job(supa, job, "queued", reason, run_after=retry_at)
            supa.update("saves", {"id": f"eq.{save['id']}"}, {"status": "queued", "error": None})
            return "retry"
        _finish_job(supa, job, "failed", reason)
        supa.update("saves", {"id": f"eq.{save['id']}"}, {"status": "failed", "error": "Processing failed. Tap Retry."})
        return "failed"
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def _ingest(supa: Supa, cfg: Config, save: dict[str, Any], workdir: Path) -> str:
    save_id, user_id = save["id"], save["user_id"]
    platform = save.get("platform") or detect_platform(save["source_url"])
    usage: list[dict[str, Any]] = []
    update: dict[str, Any] = {}
    note: str | None = None  # saves.error shown under the item (download/storage issues)

    existing = supa.one("transcripts", {"select": "segments,full_text", "save_id": f"eq.{save_id}"})
    transcript_segments: list[dict[str, Any]] = (existing or {}).get("segments") or []
    have_video = bool(save.get("video_path"))

    # 1 · Fetch ----------------------------------------------------------------
    fetched: media.Fetched | None = None
    if not have_video:
        try:
            if platform in ("instagram", "tiktok", "youtube"):
                fetched = media.download(save["source_url"], workdir, cfg.max_video_seconds, cfg.ig_cookies_b64)
            else:
                fetched = media.page_metadata(save["source_url"])
        except media.DownloadFailed:
            note = "Couldn't download the video; it plays from the original."
            try:
                fetched = media.page_metadata(save["source_url"])
            except media.DownloadFailed:
                fetched = None

    if fetched:
        update.update({
            "caption": fetched.caption or save.get("caption"),
            "title": fetched.title or save.get("title"),
            "creator_handle": fetched.creator or save.get("creator_handle"),
            "duration_s": fetched.duration or save.get("duration_s"),
        })
        # Short links (vm.tiktok.com, …) become the canonical post URL, so the embed player works.
        if fetched.webpage_url and fetched.webpage_url.startswith("https://") and fetched.webpage_url != save["source_url"]:
            update["source_url"] = fetched.webpage_url

    # 2 · Video, thumbnail, audio -------------------------------------------------
    if fetched and fetched.video:
        info = media.probe(fetched.video)
        if info["duration"]:
            update["duration_s"] = round(info["duration"], 1)
        thumb = workdir / "thumb.jpg"
        try:
            media.thumbnail(fetched.video, thumb, at_seconds=min(1.0, max(0.0, info["duration"] / 4)))
            path = f"{user_id}/{save_id}.jpg"
            supa.upload("stash-thumbs", path, thumb.read_bytes(), "image/jpeg")
            update["thumb_path"] = path
        except Exception:  # noqa: BLE001 — a missing thumbnail must not stop the save
            pass

        if cfg.has_r2 and info["has_video"]:
            out = workdir / "video.mp4"
            media.transcode(fetched.video, out)
            key = f"{user_id}/{save_id}.mp4"
            r2.upload_video(cfg, out, key)
            update["video_path"] = key
        elif not cfg.has_r2:
            note = "Video storage isn't set up yet; it plays from the original."

        if info["has_audio"] and not transcript_segments:
            audio = workdir / "audio.mp3"
            media.audio_for_transcription(fetched.video, audio)
            tr = ai.transcribe(cfg, audio)
            if tr:
                transcript_segments = tr.segments
                supa.insert("transcripts", {"save_id": save_id, "user_id": user_id,
                                            "segments": tr.segments, "full_text": tr.text}, upsert_on="save_id")
                usage.append({"user_id": user_id, "save_id": save_id, "kind": "transcribe",
                              "audio_seconds": round(tr.seconds, 1),
                              "usd": round(tr.seconds / 3600 * cfg.groq_usd_per_hour, 6)})
    elif fetched and fetched.thumb_url and not save.get("thumb_path"):
        thumb = workdir / "thumb.jpg"
        if media.fetch_image(fetched.thumb_url, thumb):
            path = f"{user_id}/{save_id}.jpg"
            try:
                supa.upload("stash-thumbs", path, thumb.read_bytes(), "image/jpeg")
                update["thumb_path"] = path
            except Exception:  # noqa: BLE001
                pass

    if update:
        supa.update("saves", {"id": f"eq.{save_id}"}, update)
    caption = update.get("caption") or save.get("caption")
    title = update.get("title") or save.get("title")
    creator = update.get("creator_handle") or save.get("creator_handle")
    transcript_text = segments_text(transcript_segments)

    # 3 · Understand + file ---------------------------------------------------------
    insights: dict[str, Any] | None = None
    if cfg.has_claude:
        space_names, inbox_id = _spaces(supa, user_id)
        u = ai.understand(cfg, platform=platform, creator=creator, title=title, caption=caption,
                          transcript=transcript_text, space_names=space_names, user_note=save.get("user_note"))
        insights = u.insights
        usage.append({"user_id": user_id, "save_id": save_id, "kind": "understand",
                      "input_tokens": u.input_tokens, "output_tokens": u.output_tokens, "usd": u.usd})
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

        if insights["cards"] and not supa.one("cards", {"select": "id", "save_id": f"eq.{save_id}"}):
            due = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
            supa.insert("cards", [{"save_id": save_id, "user_id": user_id, "due_at": due, **c}
                                  for c in insights["cards"]])
    else:
        note = note or "AI isn't set up yet, so there's no summary."

    # 4 · Embed --------------------------------------------------------------------
    if insights:
        emb = ai.embed(cfg, embedding_text(insights, caption, transcript_text))
        if emb:
            supa.insert("embeddings", {"save_id": save_id, "user_id": user_id,
                                       "vector": "[" + ",".join(f"{x:.6f}" for x in emb.vector) + "]",
                                       "model": cfg.voyage_model}, upsert_on="save_id")
            usage.append({"user_id": user_id, "save_id": save_id, "kind": "embed", "input_tokens": emb.tokens,
                          "usd": round(emb.tokens / 1e6 * cfg.voyage_usd_per_mtok, 6)})

    _log_usage(supa, usage)
    supa.update("saves", {"id": f"eq.{save_id}"}, {"status": "ready", "processed_at": _now(), "error": note})
    return "ready"


def empty_trash(supa: Supa, cfg: Config) -> int:
    rows = supa.select("media_trash", {"select": "id,store,bucket,path", "order": "id", "limit": "200"})
    if not rows:
        return 0
    # Without R2 configured the worker never stored a video there, so those rows have nothing to delete.
    r2_keys = [r["path"] for r in rows if r["store"] == "r2"]
    if r2_keys and cfg.has_r2:
        r2.delete(cfg, r2_keys)
    by_bucket: dict[str, list[str]] = {}
    for r in rows:
        if r["store"] == "storage" and r.get("bucket"):
            by_bucket.setdefault(r["bucket"], []).append(r["path"])
    for bucket, paths in by_bucket.items():
        supa.remove(bucket, paths)
    done = [str(r["id"]) for r in rows]
    if done:
        supa.delete("media_trash", {"id": f"in.({','.join(done)})"})
    return len(done)


def run(supa: Supa, cfg: Config) -> dict[str, int]:
    """Claims and processes jobs until the queue is empty or the time budget is spent."""
    started = time.monotonic()
    summary: dict[str, int] = {}
    while time.monotonic() - started < cfg.run_budget_seconds:
        jobs = supa.rpc("claim_jobs", {"p_limit": 1}) or []
        if not jobs:
            break
        for job in jobs:
            outcome = process_job(supa, cfg, job)
            summary[outcome] = summary.get(outcome, 0) + 1
    try:
        summary["trash"] = empty_trash(supa, cfg)
    except Exception:  # noqa: BLE001 — cleanup retries on the next sweep
        summary["trash_error"] = 1
    return summary
