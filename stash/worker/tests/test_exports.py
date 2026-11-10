"""Export jobs and the files they write (opened back with their own libraries)."""

from __future__ import annotations

import io
import re
import time
from pathlib import Path

import pytest
from PIL import Image

from stash_worker import exports, pipeline, render
from stash_worker.render import Brief, ExportItem, SpaceInfo

from test_pipeline import OWNER, FakeSupa, cfg


def jpeg(color=(200, 120, 60), size=(360, 640)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, "JPEG")
    return buf.getvalue()


def pdf_pages(path: Path) -> int:
    data = path.read_bytes()
    assert data.startswith(b"%PDF")
    return len(re.findall(rb"/Type\s*/Page[^s]", data))


SPACE = SpaceInfo(name="Ramadan campaign", color="teal", kind="project", description="Café launch", due_date="2026-10-30")


def items(n=20, image=True) -> list[ExportItem]:
    return [
        ExportItem(id=f"s{i}", title=f"Reference {i}", key_idea=f"Show the product in the first second, idea {i}.",
                   takeaways=["Hook fast", "Show hands", "End with the price"], creator="creator", platform="instagram",
                   source_url=f"https://www.instagram.com/reel/{i}/", applied=i % 3 == 0,
                   image=jpeg((10 * i, 120, 60)) if image else None, quotes=["the first second decides everything for the viewer"])
        for i in range(n)
    ]


BRIEF = Brief(title="Launch brief", summary="Short hooks win.", objective="Fill the café in week one.",
              insights=["Hooks in the first second"], ideas=["Film hands making the drink"],
              next_steps=["Shoot three takes"], quotes=[{"text": "the first second decides", "source": "Ref 1"}])


# --- Files ---------------------------------------------------------------------

def test_brief_pdf_and_docx_open(tmp_path):
    from docx import Document

    pdf = render.build_brief_pdf(SPACE, BRIEF, items(), tmp_path / "b.pdf")
    assert pdf_pages(pdf) >= 1
    docx = render.build_brief_docx(SPACE, BRIEF, items(), tmp_path / "b.docx")
    text = "\n".join(p.text for p in Document(str(docx)).paragraphs)
    assert "Launch brief" in text and "Reference 19" in text and "the first second decides" in text


def test_moodboard_has_a_frame_per_save(tmp_path):
    out = render.build_moodboard_pdf(SPACE, items(20), tmp_path / "m.pdf")
    assert pdf_pages(out) == 3  # 9 frames per A4 page
    data = out.read_bytes()
    assert data.count(b"/Subtype /Image") == 20  # every distinct frame is drawn


def test_moodboard_without_frames_or_saves(tmp_path):
    assert pdf_pages(render.build_moodboard_pdf(SPACE, items(4, image=False), tmp_path / "a.pdf")) == 1
    assert pdf_pages(render.build_moodboard_pdf(SPACE, [], tmp_path / "b.pdf")) == 1


def test_deck_has_one_slide_per_idea(tmp_path):
    from pptx import Presentation

    out = render.build_deck_pptx(SPACE, items(5) + [ExportItem(id="x", title="T", key_idea="Wide frame",
                                                               image=jpeg(size=(1280, 720)))], tmp_path / "d.pptx")
    prs = Presentation(str(out))
    assert len(prs.slides) == 7  # title + 6
    texts = [sh.text_frame.text for sh in prs.slides[1].shapes if sh.has_text_frame]
    assert any("idea 0" in t for t in texts)


def test_twenty_save_brief_renders_fast(tmp_path):
    started = time.monotonic()
    render.build_brief_pdf(SPACE, BRIEF, items(20), tmp_path / "b.pdf")
    render.build_brief_docx(SPACE, BRIEF, items(20), tmp_path / "b.docx")
    assert time.monotonic() - started < 10


# --- Rules -----------------------------------------------------------------------

def test_select_items_applied_first_and_filters():
    rows = [
        {"id": "a", "saved_at": "2026-01-03", "states": {"kept": False}},
        {"id": "b", "saved_at": "2026-01-01", "states": {"applied_at": "x"}},
        {"id": "c", "saved_at": "2026-01-02", "states": [{"kept": True}]},
        {"id": "d", "saved_at": "2026-01-04", "states": {"archived_at": "x", "kept": True}},
    ]
    assert [r["id"] for r in exports.select_items(rows, False)] == ["b", "a", "c"]
    assert [r["id"] for r in exports.select_items(rows, True)] == ["b", "c"]


def test_best_quotes_prefers_lines_about_the_key_idea():
    segs = [{"text": "hello everyone welcome back to the channel"},
            {"text": "always show the price at the very end of the video"},
            {"text": "ok"}]
    assert exports.best_quotes(segs, "Show the price at the end.", 1) == ["always show the price at the very end of the video"]
    assert exports.best_quotes(None, "x") == []


def test_slug_is_long_and_url_safe():
    s = exports.new_slug()
    assert len(s) >= 12 and re.fullmatch(r"[A-Za-z0-9_-]+", s)
    assert s != exports.new_slug()


def test_normalize_brief_rejects_empty():
    with pytest.raises(ValueError):
        exports.normalize_brief({"title": "x"}, SPACE)
    b = exports.normalize_brief({"summary": "s", "objective": "o", "insights": ["a", 3], "ideas": [], "next_steps": [],
                                 "quotes": [{"text": " q ", "source": "Ref 1"}]}, SPACE)
    assert b.insights == ["a"] and b.quotes == [{"text": "q", "source": "Ref 1"}] and b.title == SPACE.name


# --- Job ---------------------------------------------------------------------------

class ExportDb(FakeSupa):
    def __init__(self):
        super().__init__()
        self.tables.update({"exports": [], "states": []})
        self.files: dict[str, bytes] = {}

    def upload(self, bucket, path, data, content_type):
        super().upload(bucket, path, data, content_type)
        self.files[f"{bucket}/{path}"] = data

    def download(self, bucket, path):
        return jpeg()


@pytest.fixture()
def edb():
    d = ExportDb()
    d.tables["settings"] = [{"user_id": OWNER, "monthly_budget_usd": 5}]
    d.tables["spaces"] = [{"id": "sp", "name": "Café launch", "color_token": "amber", "kind": "project",
                           "description": None, "due_date": "2026-10-30", "user_id": OWNER}]
    d.tables["saves"] = [
        {"id": f"s{i}", "user_id": OWNER, "space_id": "sp", "title": None, "caption": f"caption {i}",
         "creator_handle": "c", "platform": "tiktok", "source_url": f"https://www.tiktok.com/@c/video/{i}",
         "thumb_path": f"{OWNER}/s{i}.jpg", "saved_at": f"2026-01-{i + 1:02d}",
         "insights": {"title": f"T{i}", "key_idea": f"Idea {i}", "takeaways": ["a", "b", "c"]},
         "states": {"kept": i % 2 == 0, "applied_at": None, "archived_at": None}}
        for i in range(20)
    ]
    d.tables["transcripts"] = [{"save_id": "s0", "segments": [{"text": "this is idea zero said out loud on camera"}]}]
    return d


def job_for(db, kind, options=None, attempts=1):
    db.tables["exports"].append({"id": f"e-{kind}", "user_id": OWNER, "space_id": "sp", "kind": kind,
                                 "options": options or {}, "status": "queued", "share_slug": None})
    j = {"id": f"j-{kind}", "type": "export", "space_id": "sp", "attempts": attempts,
         "payload": {"export_id": f"e-{kind}"}, "state": "running"}
    db.tables["jobs"].append(dict(j))
    return j


def test_brief_job_without_ai_still_writes_pdf_and_docx(edb):
    job = job_for(edb, "brief", {"include_quotes": True})
    assert pipeline.process_job(edb, cfg(), job) == "export_ready"
    e = edb.tables["exports"][0]
    assert e["status"] == "ready" and e["file_path"] == f"{OWNER}/e-brief.pdf"
    assert set(e["files"]) == {"pdf", "docx"}
    assert edb.files[f"stash-exports/{OWNER}/e-brief.pdf"].startswith(b"%PDF")
    assert edb.tables["jobs"][0]["state"] == "done"


def test_brief_job_uses_smart_model_and_logs_usage(edb, monkeypatch):
    seen = {}

    def fake_write(c, space, its, include_quotes):
        seen["n"], seen["quotes"] = len(its), include_quotes
        return exports.BriefResult(BRIEF, 3000, 800, 0.021)

    monkeypatch.setattr(exports, "write_brief", fake_write)
    job = job_for(edb, "brief", {"only_applied_kept": True})
    assert pipeline.process_job(edb, cfg(smart_model="smart"), job) == "export_ready"
    assert seen == {"n": 10, "quotes": False}  # only kept saves
    assert [u["kind"] for u in edb.tables["usage"]] == ["export"]
    assert edb.tables["usage"][0]["usd"] == 0.021


def test_moodboard_and_deck_jobs(edb):
    assert pipeline.process_job(edb, cfg(), job_for(edb, "moodboard")) == "export_ready"
    assert pipeline.process_job(edb, cfg(), job_for(edb, "deck")) == "export_ready"
    assert {e["kind"]: e["file_path"] for e in edb.tables["exports"]} == {
        "moodboard": f"{OWNER}/e-moodboard.pdf", "deck": f"{OWNER}/e-deck.pptx"}


def test_collection_job_gets_a_slug(edb):
    assert pipeline.process_job(edb, cfg(), job_for(edb, "collection")) == "export_ready"
    e = edb.tables["exports"][0]
    assert e["status"] == "ready" and len(e["share_slug"]) >= 12


def test_export_from_a_stranger_is_refused(edb):
    job = job_for(edb, "brief")
    assert pipeline.process_job(edb, cfg(owner_user_ids=frozenset({"other"})), job) == "not_owner"
    assert edb.tables["exports"][0]["status"] == "failed"
    assert not edb.files


def test_brief_over_budget_fails_clearly(edb):
    edb.tables["usage"] = [{"user_id": OWNER, "usd": 9, "created_at": "9999-01-01"}]
    assert pipeline.process_job(edb, cfg(smart_model="smart"), job_for(edb, "brief")) == "budget"
    assert "budget" in edb.tables["exports"][0]["error"].lower()


def test_failure_retries_once_then_fails(edb, monkeypatch):
    monkeypatch.setattr(render, "build_moodboard_pdf", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("x")))
    monkeypatch.setattr(exports, "build_moodboard_pdf", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("x")))
    assert pipeline.process_job(edb, cfg(), job_for(edb, "moodboard")) == "retry"
    assert edb.tables["exports"][0]["status"] == "queued"
    edb.tables["exports"].clear()
    assert pipeline.process_job(edb, cfg(), job_for(edb, "moodboard", attempts=2)) == "RuntimeError"
    assert edb.tables["exports"][0]["status"] == "failed"


def test_missing_export_row_finishes_the_job(edb):
    j = {"id": "j", "type": "export", "payload": {"export_id": "nope"}, "attempts": 1}
    edb.tables["jobs"].append(dict(j, state="running"))
    assert pipeline.process_job(edb, cfg(), j) == "gone"
