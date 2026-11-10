"""Export files: creative brief (PDF + DOCX), moodboard (PDF), reference deck (PPTX).

Pure builders: they take plain data and a path, and never touch the network,
so tests can open what they write.
"""

from __future__ import annotations

import io
import os
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

# Brand colours for documents: a mirror of styles/tokens.css, light theme (it prints well on white).
# The function bundle has no access to the app's CSS, so the values are repeated here and
# tests/test_tokens.py fails as soon as the two drift apart. TOKEN_NAMES says which token each one is.
SPACE_HEX = {
    "violet": "6B4FD8", "teal": "0B7A6A", "amber": "8A5A00", "blue": "2F5FD0", "rose": "C0365F",
    "green": "3A7A2A", "cyan": "0A7389", "sand": "76603C", "inbox": "555764",
}
INK = "0C0E16"     # --text-primary
MUTED = "555764"   # --text-secondary
PAPER = "F4F2EB"   # --background
TOKEN_NAMES = {"INK": "--text-primary", "MUTED": "--text-secondary", "PAPER": "--background",
               **{f"SPACE_HEX.{name}": f"--space-{name}" for name in SPACE_HEX}}


def space_hex(color: str | None) -> str:
    return SPACE_HEX.get(color or "", SPACE_HEX["violet"])


@dataclass
class ExportItem:
    """One save as the export sees it."""

    id: str
    title: str
    key_idea: str
    takeaways: list[str] = field(default_factory=list)
    creator: str | None = None
    platform: str | None = None
    source_url: str | None = None
    applied: bool = False
    image: bytes | None = None  # thumbnail (JPEG/PNG bytes) when there is one
    quotes: list[str] = field(default_factory=list)


@dataclass
class Brief:
    title: str
    summary: str
    objective: str
    insights: list[str]
    ideas: list[str]
    next_steps: list[str]
    quotes: list[dict[str, str]] = field(default_factory=list)  # [{"text", "source"}]


@dataclass
class SpaceInfo:
    name: str
    color: str = "violet"
    kind: str = "topic"
    description: str | None = None
    due_date: str | None = None


# --- Fonts ----------------------------------------------------------------------
# DejaVu (when the machine has it) covers French accents and Arabic letters. The function has no
# system fonts, so the next choice is Bitstream Vera, which ships inside reportlab (accents, no Arabic).
_DEJAVU = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/TTF/DejaVuSans.ttf",
]


def _vera() -> str | None:
    try:
        import reportlab

        path = os.path.join(os.path.dirname(reportlab.__file__), "fonts", "Vera.ttf")
        return path if os.path.exists(path) else None
    except Exception:  # noqa: BLE001
        return None


def _pdf_fonts() -> tuple[str, str]:
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    regular = next((p for p in _DEJAVU if os.path.exists(p)), None) or _vera()
    if regular:
        bold = regular.replace("DejaVuSans.ttf", "DejaVuSans-Bold.ttf").replace("Vera.ttf", "VeraBd.ttf")
        try:
            if "StashSans" not in pdfmetrics.getRegisteredFontNames():
                pdfmetrics.registerFont(TTFont("StashSans", regular))
                pdfmetrics.registerFont(TTFont("StashSans-Bold", bold if os.path.exists(bold) else regular))
            return "StashSans", "StashSans-Bold"
        except Exception:  # noqa: BLE001 — fall back to the built-in font
            pass
    return "Helvetica", "Helvetica-Bold"


def _esc(text: str) -> str:
    return (text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _due(space: SpaceInfo) -> str:
    if space.kind == "project" and space.due_date:
        try:
            return "Project · due " + date.fromisoformat(space.due_date).strftime("%-d %b %Y")
        except ValueError:
            return "Project"
    return "Project" if space.kind == "project" else "Topic"


# --- Creative brief ----------------------------------------------------------------

def build_brief_pdf(space: SpaceInfo, brief: Brief, items: list[ExportItem], path: Path) -> Path:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_LEFT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import HRFlowable, ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer

    regular, bold = _pdf_fonts()
    accent = colors.HexColor("#" + space_hex(space.color))
    ink, muted = colors.HexColor("#" + INK), colors.HexColor("#" + MUTED)

    def style(name: str, size: float, font: str = regular, color=ink, space_after: float = 4, leading: float | None = None):
        return ParagraphStyle(name, fontName=font, fontSize=size, leading=leading or size * 1.35,
                              textColor=color, spaceAfter=space_after, alignment=TA_LEFT)

    eyebrow = style("eyebrow", 10, bold, accent, 2)
    h1 = style("h1", 24, bold, ink, 6)
    h2 = style("h2", 13, bold, accent, 4)
    body = style("body", 10.5)
    small = style("small", 9, regular, muted)

    def bullets(lines: list[str]):
        return ListFlowable(
            [ListItem(Paragraph(_esc(t), body), leftIndent=10) for t in lines if t],
            bulletType="bullet", bulletColor=accent, start="•", leftIndent=12,
        )

    story: list[Any] = [
        Paragraph(_esc(f"Creative brief · {_due(space)}"), eyebrow),
        Paragraph(_esc(brief.title or space.name), h1),
        HRFlowable(width="100%", thickness=2, color=accent, spaceAfter=8),
        Paragraph(_esc(brief.summary), body),
        Spacer(1, 4),
        Paragraph("Objective", h2),
        Paragraph(_esc(brief.objective), body),
    ]
    for heading, lines in (("What the references say", brief.insights),
                           ("Ideas to try", brief.ideas),
                           ("Next steps", brief.next_steps)):
        if lines:
            story += [Paragraph(heading, h2), bullets(lines)]
    if brief.quotes:
        story.append(Paragraph("Key quotes", h2))
        for q in brief.quotes:
            story.append(Paragraph(f"“{_esc(q.get('text', ''))}” <font color='#{MUTED}'>— {_esc(q.get('source', ''))}</font>", body))
    story.append(Paragraph(f"References ({len(items)})", h2))
    for i, it in enumerate(items, 1):
        who = " · ".join(x for x in (it.creator and f"@{it.creator.lstrip('@')}", it.platform) if x)
        link = f" <link href='{_esc(it.source_url)}' color='#{space_hex(space.color)}'>open</link>" if it.source_url else ""
        story.append(Paragraph(f"<b>{i}. {_esc(it.title)}</b>{' · applied' if it.applied else ''}", body))
        story.append(Paragraph(_esc(it.key_idea) + (f" <font color='#{MUTED}'>({_esc(who)})</font>" if who else "") + link, small))

    doc = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                            topMargin=16 * mm, bottomMargin=16 * mm, title=brief.title or space.name,
                            author="Stash")
    doc.build(story)
    return path


def build_brief_docx(space: SpaceInfo, brief: Brief, items: list[ExportItem], path: Path) -> Path:
    from docx import Document
    from docx.shared import Pt, RGBColor

    accent = RGBColor.from_string(space_hex(space.color))
    doc = Document()
    doc.core_properties.title = brief.title or space.name
    doc.core_properties.author = "Stash"

    eyebrow = doc.add_paragraph()
    run = eyebrow.add_run(f"Creative brief · {_due(space)}")
    run.bold, run.font.size, run.font.color.rgb = True, Pt(10), accent
    doc.add_heading(brief.title or space.name, level=0)
    doc.add_paragraph(brief.summary)

    def heading(text: str):
        h = doc.add_heading(text, level=1)
        for r in h.runs:
            r.font.color.rgb = accent

    heading("Objective")
    doc.add_paragraph(brief.objective)
    for title, lines in (("What the references say", brief.insights), ("Ideas to try", brief.ideas),
                         ("Next steps", brief.next_steps)):
        if lines:
            heading(title)
            for line in lines:
                doc.add_paragraph(line, style="List Bullet")
    if brief.quotes:
        heading("Key quotes")
        for q in brief.quotes:
            p = doc.add_paragraph(style="Quote") if "Quote" in [s.name for s in doc.styles] else doc.add_paragraph()
            p.add_run(f"“{q.get('text', '')}” — {q.get('source', '')}")
    heading(f"References ({len(items)})")
    for i, it in enumerate(items, 1):
        p = doc.add_paragraph()
        p.add_run(f"{i}. {it.title}").bold = True
        if it.applied:
            p.add_run(" · applied")
        detail = doc.add_paragraph(it.key_idea)
        if it.source_url:
            detail.add_run(f"  {it.source_url}").font.size = Pt(8)
    doc.save(str(path))
    return path


# --- Moodboard -------------------------------------------------------------------

def _fit_image(data: bytes, max_w: float, max_h: float):
    """A reportlab ImageReader plus the drawn size that fits the box (cover-cropped to the box ratio)."""
    from PIL import Image
    from reportlab.lib.utils import ImageReader

    im = Image.open(io.BytesIO(data))
    im = im.convert("RGB")
    box_ratio = max_w / max_h
    w, h = im.size
    if w / h > box_ratio:  # too wide: crop the sides
        nw = int(h * box_ratio)
        im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:  # too tall: crop top and bottom
        nh = int(w / box_ratio)
        im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    im.thumbnail((900, 900))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=82)
    buf.seek(0)
    return ImageReader(buf)


def build_moodboard_pdf(space: SpaceInfo, items: list[ExportItem], path: Path, columns: int = 3) -> Path:
    """A grid of key frames (thumbnails), each with its key idea underneath. A4 portrait."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    regular, bold = _pdf_fonts()
    accent = colors.HexColor("#" + space_hex(space.color))
    ink, muted, paper = colors.HexColor("#" + INK), colors.HexColor("#" + MUTED), colors.HexColor("#" + PAPER)
    page_w, page_h = A4
    margin, gap = 14 * mm, 5 * mm
    cell_w = (page_w - 2 * margin - (columns - 1) * gap) / columns
    img_h = cell_w * 16 / 9 * 0.55  # vertical frames, trimmed so 3 rows (9 frames) fit a page
    cell_h = img_h + 16 * mm
    header_h = 22 * mm

    c = canvas.Canvas(str(path), pagesize=A4)
    c.setTitle(f"{space.name} · moodboard")
    c.setAuthor("Stash")

    def header():
        c.setFillColor(accent)
        c.setFont(bold, 9)
        c.drawString(margin, page_h - margin, f"MOODBOARD · {_due(space).upper()}")
        c.setFillColor(ink)
        c.setFont(bold, 20)
        c.drawString(margin, page_h - margin - 9 * mm, space.name[:60])

    def wrap(text: str, font: str, size: float, width: float, lines: int) -> list[str]:
        from reportlab.pdfbase.pdfmetrics import stringWidth

        out, cur = [], ""
        for word in (text or "").split():
            test = f"{cur} {word}".strip()
            if stringWidth(test, font, size) <= width:
                cur = test
            else:
                if cur:
                    out.append(cur)
                cur = word
            if len(out) == lines:
                break
        if cur and len(out) < lines:
            out.append(cur)
        if len(out) == lines and " ".join(out) != " ".join((text or "").split()):
            out[-1] = out[-1].rstrip(".,;:") + "…"
        return out

    rows_per_page = max(1, int((page_h - 2 * margin - header_h + gap) // (cell_h + gap)))
    per_page = rows_per_page * columns
    if not items:
        header()
        c.setFont(regular, 11)
        c.setFillColor(muted)
        c.drawString(margin, page_h - margin - header_h - 4 * mm, "No saves to show yet.")
    for i, it in enumerate(items):
        slot = i % per_page
        if slot == 0:
            if i:
                c.showPage()
            header()
        row, col = divmod(slot, columns)
        x = margin + col * (cell_w + gap)
        y_top = page_h - margin - header_h - row * (cell_h + gap)
        y_img = y_top - img_h
        drawn = False
        if it.image:
            try:
                c.drawImage(_fit_image(it.image, cell_w, img_h), x, y_img, cell_w, img_h)
                drawn = True
            except Exception:  # noqa: BLE001 — unreadable image: draw the placeholder
                drawn = False
        if not drawn:
            c.setFillColor(paper)
            c.rect(x, y_img, cell_w, img_h, stroke=0, fill=1)
            c.setFillColor(muted)
            c.setFont(regular, 8)
            c.drawCentredString(x + cell_w / 2, y_img + img_h / 2, (it.platform or "no frame").capitalize())
        c.setFillColor(accent)
        c.rect(x, y_top - 1.2 * mm, cell_w, 1.2 * mm, stroke=0, fill=1)  # Space colour top edge
        c.setFillColor(ink)
        c.setFont(bold, 8.5)
        ty = y_img - 4.5 * mm
        for line in wrap(it.key_idea or it.title, bold, 8.5, cell_w, 2):
            c.drawString(x, ty, line)
            ty -= 3.8 * mm
        if it.creator:
            c.setFillColor(muted)
            c.setFont(regular, 7.5)
            c.drawString(x, ty, f"@{it.creator.lstrip('@')}"[:40])
        if it.source_url:
            c.linkURL(it.source_url, (x, y_img, x + cell_w, y_top), relative=0)
    c.save()  # closes the last page
    return path


# --- Reference deck ----------------------------------------------------------------

def build_deck_pptx(space: SpaceInfo, items: list[ExportItem], path: Path) -> Path:
    """Title slide, then one slide per idea: frame on the left, key idea and takeaways on the right."""
    from pptx import Presentation
    from pptx.dml.color import RGBColor
    from pptx.util import Emu, Pt

    accent = RGBColor.from_string(space_hex(space.color))
    ink, muted = RGBColor.from_string(INK), RGBColor.from_string(MUTED)
    prs = Presentation()
    prs.slide_width, prs.slide_height = Emu(12192000), Emu(6858000)  # 16:9
    blank = prs.slide_layouts[6]
    W, H = prs.slide_width, prs.slide_height
    margin = Emu(457200)  # 0.5 in

    def text_box(slide, x, y, w, h, text, size, *, bold=False, color=ink):
        tb = slide.shapes.add_textbox(x, y, w, h)
        tf = tb.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        r = p.add_run()
        r.text = text
        r.font.size, r.font.bold, r.font.color.rgb = Pt(size), bold, color
        return tf

    def bar(slide):
        shape = slide.shapes.add_shape(1, 0, 0, W, Emu(91440))  # 1 = rectangle
        shape.fill.solid()
        shape.fill.fore_color.rgb = accent
        shape.line.fill.background()

    s = prs.slides.add_slide(blank)
    bar(s)
    text_box(s, margin, Emu(2000000), W - 2 * margin, Emu(500000), f"Reference deck · {_due(space)}", 16, bold=True, color=accent)
    text_box(s, margin, Emu(2500000), W - 2 * margin, Emu(1200000), space.name, 44, bold=True)
    if space.description:
        text_box(s, margin, Emu(3800000), W - 2 * margin, Emu(900000), space.description, 18, color=muted)
    text_box(s, margin, H - Emu(800000), W - 2 * margin, Emu(400000), f"{len(items)} references", 14, color=muted)

    img_w = Emu(int(H * 0.62 * 9 / 16))
    for i, it in enumerate(items, 1):
        s = prs.slides.add_slide(blank)
        bar(s)
        left = margin
        if it.image:
            try:
                pic = s.shapes.add_picture(io.BytesIO(it.image), margin, Emu(500000), height=H - Emu(1000000))
                if pic.width > img_w:  # landscape frames: keep the slide's balance
                    ratio = img_w / pic.width
                    pic.width, pic.height = img_w, int(pic.height * ratio)
                left = margin + pic.width + Emu(365760)
            except Exception:  # noqa: BLE001 — skip unreadable frames
                left = margin
        width = W - left - margin
        text_box(s, left, Emu(500000), width, Emu(400000), f"{i:02d}" + (" · applied" if it.applied else ""), 14, bold=True, color=accent)
        text_box(s, left, Emu(900000), width, Emu(1500000), it.key_idea or it.title, 30, bold=True)
        tf = text_box(s, left, Emu(2600000), width, Emu(2800000), "", 16)
        for j, t in enumerate(it.takeaways[:3]):
            p = tf.paragraphs[0] if j == 0 else tf.add_paragraph()
            r = p.add_run()
            r.text = f"• {t}"
            r.font.size, r.font.color.rgb = Pt(16), ink
        for q in it.quotes[:1]:
            p = tf.add_paragraph()
            r = p.add_run()
            r.text = f"“{q}”"
            r.font.size, r.font.italic, r.font.color.rgb = Pt(14), True, muted
        who = " · ".join(x for x in (it.creator and f"@{it.creator.lstrip('@')}", it.platform) if x)
        foot = text_box(s, left, H - Emu(900000), width, Emu(400000), who, 12, color=muted)
        if it.source_url:
            r = foot.paragraphs[0].add_run()
            r.text = ("  " if who else "") + "Open original"
            r.font.size, r.font.color.rgb = Pt(12), accent
            r.hyperlink.address = it.source_url
        s.notes_slide.notes_text_frame.text = it.title
    prs.save(str(path))
    return path


MIME = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}
