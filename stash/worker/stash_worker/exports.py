"""`export` jobs: turn a Space's saves into a brief, a moodboard or a deck.

The brief's text is written by the smart model from the saves' insights (and
transcript quotes when asked). Without it, the brief is assembled from the
insights alone, so an export never fails for lack of a key. The deck and the
moodboard need no AI at all.
"""

from __future__ import annotations

import logging
import secrets
import shutil
import tempfile
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from .config import Config
from .render import MIME, Brief, ExportItem, SpaceInfo, build_brief_docx, build_brief_pdf, build_deck_pptx, build_moodboard_pdf
from .rules import InsightError, is_owner

Supa = Any  # the proxy client (stash_worker.proxy.Proxy), or a fake in tests

log = logging.getLogger("stash.exports")

BUCKET = "stash-exports"
MAX_ITEMS = 60  # a brief or deck from more saves than this stops being useful (and costs more)


def new_slug() -> str:
    """16 URL-safe characters (96 random bits): unguessable."""
    return secrets.token_urlsafe(12)


def _opt(options: Any, key: str) -> bool:
    return bool(isinstance(options, dict) and options.get(key))


def _strings(v: Any) -> list[str]:
    return [x.strip() for x in v if isinstance(x, str) and x.strip()] if isinstance(v, list) else []


def _one(v: Any) -> dict[str, Any]:
    if isinstance(v, list):
        return v[0] if v else {}
    return v or {}


def select_items(rows: list[dict[str, Any]], only_applied_kept: bool) -> list[dict[str, Any]]:
    """Saves of the Space in export order: archived out, applied first, then newest."""
    out = []
    for r in rows:
        st = _one(r.get("states"))
        if st.get("archived_at"):
            continue
        if only_applied_kept and not (st.get("applied_at") or st.get("kept")):
            continue
        out.append(r)
    out.sort(key=lambda r: r.get("saved_at") or "", reverse=True)
    out.sort(key=lambda r: 0 if _one(r.get("states")).get("applied_at") else 1)
    return out[:MAX_ITEMS]


def best_quotes(segments: Any, key_idea: str, n: int = 2) -> list[str]:
    """Transcript lines that share the most words with the key idea (no AI needed)."""
    if not isinstance(segments, list):
        return []
    idea = {w.lower().strip(".,!?;:") for w in (key_idea or "").split() if len(w) > 3}
    scored = []
    for s in segments:
        text = str((s or {}).get("text", "")).strip() if isinstance(s, dict) else ""
        if len(text.split()) < 5:
            continue
        words = {w.lower().strip(".,!?;:") for w in text.split()}
        scored.append((len(idea & words), len(text), text))
    scored.sort(key=lambda t: (-t[0], -t[1]))
    return [t[2][:240] for t in scored[:n]]


def to_item(row: dict[str, Any], quotes: list[str], image: bytes | None) -> ExportItem:
    ins = _one(row.get("insights"))
    st = _one(row.get("states"))
    caption_line = (row.get("title") or row.get("caption") or "").split("\n")[0].strip()[:120]
    return ExportItem(
        id=row["id"],
        title=ins.get("title") or caption_line or "Saved post",
        key_idea=ins.get("key_idea") or caption_line or "",
        takeaways=_strings(ins.get("takeaways")),
        creator=row.get("creator_handle"),
        platform=row.get("platform"),
        source_url=row.get("source_url"),
        applied=bool(st.get("applied_at")),
        image=image,
        quotes=quotes,
    )


# --- Brief text ----------------------------------------------------------------

BRIEF_SYSTEM = """You write a one-page creative brief for a marketing manager, from the reference videos she saved in one Space.
Rules:
- Base every line on the references given (key ideas, takeaways, quotes). Never invent facts, numbers or brands.
- Plain, direct English. Short sentences. No hype.
- insights: 3 to 6 patterns that several references share, each one sentence.
- ideas: 3 to 6 concrete things to try for this project, each one sentence starting with a verb.
- next_steps: 2 to 4 small actions for this week.
- quotes: only when transcript quotes are provided: up to 4, copied word for word, with the reference number as source (e.g. "Ref 3").
Always answer by calling write_brief."""

BRIEF_TOOL = {
    "name": "write_brief",
    "description": "Store the creative brief.",
    "input_schema": {
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "Brief title, 3 to 8 words."},
            "summary": {"type": "string", "description": "Two or three sentences: what these references add up to."},
            "objective": {"type": "string", "description": "One sentence."},
            "insights": {"type": "array", "items": {"type": "string"}},
            "ideas": {"type": "array", "items": {"type": "string"}},
            "next_steps": {"type": "array", "items": {"type": "string"}},
            "quotes": {
                "type": "array",
                "items": {"type": "object", "properties": {"text": {"type": "string"}, "source": {"type": "string"}},
                          "required": ["text", "source"]},
            },
        },
        "required": ["title", "summary", "objective", "insights", "ideas", "next_steps"],
    },
}


@dataclass
class BriefResult:
    brief: Brief
    input_tokens: int = 0
    output_tokens: int = 0
    usd: float = 0.0
    provider: str = ""


def fallback_brief(space: SpaceInfo, items: list[ExportItem]) -> Brief:
    """No AI: the brief is assembled from the saves' own insights."""
    takeaways: list[str] = []
    for it in items:
        for t in it.takeaways:
            if t not in takeaways:
                takeaways.append(t)
    quotes = [{"text": q, "source": f"Ref {i}"} for i, it in enumerate(items, 1) for q in it.quotes[:1]][:4]
    return Brief(
        title=space.name,
        summary=f"{len(items)} saved references for {space.name}." + (f" {space.description}" if space.description else ""),
        objective=space.description or f"Turn what these references show into work for {space.name}.",
        insights=[it.key_idea for it in items if it.key_idea][:6],
        ideas=takeaways[:6],
        next_steps=["Pick the two ideas that fit best and try them this week."],
        quotes=quotes,
    )


def normalize_brief(raw: Any, space: SpaceInfo) -> Brief:
    if not isinstance(raw, dict):
        raise ValueError("brief is not an object")

    def text(key: str, limit: int) -> str:
        v = raw.get(key)
        return " ".join(v.split())[:limit] if isinstance(v, str) else ""

    def lines(key: str, n: int) -> list[str]:
        return [" ".join(x.split())[:300] for x in _strings(raw.get(key))][:n]

    summary, objective = text("summary", 800), text("objective", 300)
    if not summary or not objective:
        raise ValueError("summary or objective missing")
    quotes = []
    for q in raw.get("quotes") or []:
        if isinstance(q, dict) and isinstance(q.get("text"), str) and q["text"].strip():
            quotes.append({"text": " ".join(q["text"].split())[:300], "source": str(q.get("source") or "")[:40]})
    return Brief(
        title=text("title", 120) or space.name,
        summary=summary,
        objective=objective,
        insights=lines("insights", 6),
        ideas=lines("ideas", 6),
        next_steps=lines("next_steps", 4),
        quotes=quotes[:4],
    )


def write_brief(cfg: Config, space: SpaceInfo, items: list[ExportItem], include_quotes: bool) -> BriefResult:
    """One smart-model call. Falls back to the insights-only brief when no provider is usable."""
    if not cfg.has_ai or not items:
        return BriefResult(fallback_brief(space, items))
    from . import ai  # lazy

    refs = []
    for i, it in enumerate(items, 1):
        part = f"Ref {i}: {it.title}\nKey idea: {it.key_idea}\nTakeaways: " + "; ".join(it.takeaways)
        if include_quotes and it.quotes:
            part += "\nTranscript quotes: " + " | ".join(f'"{q}"' for q in it.quotes)
        refs.append(part)
    content = (
        f"Space: {space.name} ({space.kind}{', due ' + space.due_date if space.due_date else ''})\n"
        f"Description: {space.description or '(none)'}\n"
        f"Include quotes: {'yes' if include_quotes else 'no'}\n\n" + "\n\n".join(refs)
    )[:40000]

    def validate(raw: Any) -> Brief:
        try:
            return normalize_brief(raw, space)
        except ValueError as exc:
            raise InsightError(str(exc)) from None

    try:
        r = ai.structured(cfg, "smart", system=BRIEF_SYSTEM, tool=BRIEF_TOOL, content=content, max_tokens=2000,
                          validate=validate)
        result = BriefResult(r.value, r.input_tokens, r.output_tokens, r.usd, r.provider)
    except InsightError as exc:  # two unusable answers: the insights-only brief, the tokens still logged
        t = getattr(exc, "tokens", (0, 0))
        result = BriefResult(fallback_brief(space, items), t[0], t[1], getattr(exc, "usd", 0.0),
                             getattr(exc, "provider", ""))
    except (ai.ProviderError, ai.NoProvider):  # the provider is down: an export never fails for that
        result = BriefResult(fallback_brief(space, items))
    if not include_quotes:
        result.brief.quotes = []
    return result


# --- Job -------------------------------------------------------------------------

def _month_start() -> str:
    n = datetime.now(timezone.utc)
    return n.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()


def _over_budget(supa: Supa, user_id: str) -> bool:
    rows = supa.select("usage", {"select": "usd", "user_id": f"eq.{user_id}", "created_at": f"gte.{_month_start()}"})
    spent = sum(float(r.get("usd") or 0) for r in rows)
    row = supa.one("settings", {"select": "monthly_budget_usd", "user_id": f"eq.{user_id}"})
    return spent >= float((row or {}).get("monthly_budget_usd") or 5)


def _finish_job(supa: Supa, job: dict[str, Any], state: str, error: str | None = None, run_after: str | None = None) -> None:
    values: dict[str, Any] = {"state": state, "error": error, "locked_at": None}
    if run_after:
        values["run_after"] = run_after
    supa.update("jobs", {"id": f"eq.{job['id']}"}, values)


def _fail(supa: Supa, job: dict[str, Any], export_id: str, message: str, reason: str) -> str:
    supa.update("exports", {"id": f"eq.{export_id}"}, {"status": "failed", "error": message})
    _finish_job(supa, job, "failed", reason)
    return reason


def _thumb(supa: Supa, row: dict[str, Any]) -> bytes | None:
    path = row.get("thumb_path")
    if not path or not str(path).startswith(f"{row['user_id']}/"):
        return None
    try:
        return supa.download("stash-thumbs", path)
    except Exception:  # noqa: BLE001 — a missing frame never fails an export
        return None


def process_export(supa: Supa, cfg: Config, job: dict[str, Any]) -> str:
    export_id = (job.get("payload") or {}).get("export_id")
    export = supa.one("exports", {"select": "*", "id": f"eq.{export_id}"}) if export_id else None
    if not export:
        _finish_job(supa, job, "done")
        return "gone"

    user_id = export["user_id"]
    from .pipeline import owner_mismatch  # circular at import time
    if owner_mismatch(job, user_id):
        # Not this job's export: leave the row alone, fail only the job.
        _finish_job(supa, job, "failed", "owner_mismatch")
        return "owner_mismatch"
    space_row = supa.one("spaces", {"select": "user_id", "id": f"eq.{export['space_id']}"})
    if not space_row or str(space_row.get("user_id")) != str(user_id):
        return _fail(supa, job, export["id"], "This Space isn't yours.", "owner_mismatch")
    if not is_owner(user_id, cfg.owner_user_ids):
        return _fail(supa, job, export["id"], "This device isn't allowed to use the worker yet (add its id to the owner list).", "not_owner")

    kind = export["kind"]
    if kind == "collection":
        # Normally minted by the database; this keeps old rows working.
        supa.update("exports", {"id": f"eq.{export['id']}"},
                    {"share_slug": export.get("share_slug") or new_slug(), "status": "ready", "error": None})
        _finish_job(supa, job, "done")
        return "export_ready"

    options = export.get("options") or {}
    include_quotes = _opt(options, "include_quotes")
    if kind == "brief" and cfg.has_ai and _over_budget(supa, user_id):
        return _fail(supa, job, export["id"], "Monthly AI budget reached. Raise it in Settings, then try again.", "budget")

    supa.update("exports", {"id": f"eq.{export['id']}"}, {"status": "running", "error": None})
    workdir = Path(tempfile.mkdtemp(prefix="stash-export-"))
    try:
        sp = supa.one("spaces", {"select": "name,color_token,kind,description,due_date", "id": f"eq.{export['space_id']}"}) or {}
        space = SpaceInfo(name=sp.get("name") or "Space", color=sp.get("color_token") or "violet",
                          kind=sp.get("kind") or "topic", description=sp.get("description"), due_date=sp.get("due_date"))
        rows = supa.select("saves", {
            "select": "id,user_id,title,caption,creator_handle,platform,source_url,thumb_path,saved_at,"
                      "insights(title,key_idea,takeaways),states(kept,applied_at,archived_at)",
            "space_id": f"eq.{export['space_id']}", "user_id": f"eq.{user_id}",
            "order": "saved_at.desc", "limit": "500",
        })
        rows = select_items(rows, _opt(options, "only_applied_kept"))

        segments: dict[str, Any] = {}
        if include_quotes and rows:
            ids = ",".join(r["id"] for r in rows)
            for t in supa.select("transcripts", {"select": "save_id,segments", "save_id": f"in.({ids})"}):
                segments[t["save_id"]] = t.get("segments")
        want_images = kind in ("moodboard", "deck")
        items = [
            to_item(r, best_quotes(segments.get(r["id"]), _one(r.get("insights")).get("key_idea") or "") if include_quotes else [],
                    _thumb(supa, r) if want_images else None)
            for r in rows
        ]

        files: dict[str, Path] = {}
        if kind == "brief":
            result = write_brief(cfg, space, items, include_quotes)
            if result.usd or result.input_tokens:
                supa.insert("usage", [{"user_id": user_id, "save_id": None, "kind": "export",
                                       "provider": result.provider or None,
                                       "input_tokens": result.input_tokens, "output_tokens": result.output_tokens,
                                       "audio_seconds": 0, "usd": result.usd}])
            files["pdf"] = build_brief_pdf(space, result.brief, items, workdir / "brief.pdf")
            files["docx"] = build_brief_docx(space, result.brief, items, workdir / "brief.docx")
        elif kind == "moodboard":
            files["pdf"] = build_moodboard_pdf(space, items, workdir / "moodboard.pdf")
        elif kind == "deck":
            files["pptx"] = build_deck_pptx(space, items, workdir / "deck.pptx")
        else:
            return _fail(supa, job, export["id"], "Unknown export type.", "unknown_kind")

        stored: dict[str, str] = {}
        for ext, local in files.items():
            key = f"{user_id}/{export['id']}.{ext}"
            supa.upload(BUCKET, key, local.read_bytes(), MIME[ext])
            stored[ext] = key
        main = stored.get("pdf") or stored.get("pptx") or next(iter(stored.values()))
        supa.update("exports", {"id": f"eq.{export['id']}"},
                    {"status": "ready", "file_path": main, "files": stored, "error": None})
        _finish_job(supa, job, "done")
        return "export_ready"
    except Exception as exc:  # noqa: BLE001 — report, retry once, then fail
        reason = type(exc).__name__
        log.warning("export failed: %s", reason)
        if job.get("attempts", 1) < 2:
            retry_at = (datetime.now(timezone.utc) + timedelta(minutes=1)).isoformat()
            supa.update("exports", {"id": f"eq.{export['id']}"}, {"status": "queued"})
            _finish_job(supa, job, "queued", reason, run_after=retry_at)
            return "retry"
        return _fail(supa, job, export["id"], "The export didn't work. Try again.", reason)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
