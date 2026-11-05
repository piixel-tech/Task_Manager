"""The monthly report as a printable PDF (portrait A4): lavender only on headers, charcoal text, lots of white space."""
import calendar
import io
import re
import zipfile
from datetime import date
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.platypus import KeepTogether, PageBreak, BaseDocTemplate, Flowable, Frame, FrameBreak, Image, NextPageTemplate, PageTemplate, Paragraph, Spacer, Table, TableStyle

from app.core.timeutil import today_local
from app.schemas.report import ReportOut
from datetime import date as _date  # noqa: F401
from app.services.monthly_report import clock12, clock12_exact, nice_time, versus

LAVENDER = colors.HexColor("#C4B5E0")
SOFT = colors.HexColor("#F6F4FB")
INK = colors.HexColor("#2A2933")
MUTED = colors.HexColor("#6E6B7B")
LINE = colors.HexColor("#E4E0EF")
TRACK = colors.HexColor("#ECE9F4")
GREEN = colors.HexColor("#2F8F5B")
RED = colors.HexColor("#C0392B")
AMBER = colors.HexColor("#B7791F")
BLUE = colors.HexColor("#2F6FB0")
GREY = colors.HexColor("#8A8697")
LAVENDER_DARK = colors.HexColor("#A894D6")

STATUS_LABEL = {"present": "Present", "wfh": "Work from home", "half_day": "Half day", "leave": "On leave"}
STATUS_COLOR = {"present": GREEN, "wfh": BLUE, "half_day": AMBER, "leave": RED}
STATUS_LETTER = {"present": "P", "wfh": "W", "half_day": "H", "leave": "L"}
RESULT_COLOR = {"Early": GREEN, "On time": BLUE, "Late": RED, "Pending": GREY}


def plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def hexof(c) -> str:
    return "#" + c.hexval()[2:]


def safe(text: str | None) -> str:
    """Text the built-in PDF fonts can draw (Western characters; anything else becomes ?), escaped for Paragraph markup."""
    return escape((text or "").encode("cp1252", "replace").decode("cp1252"))


def plain(text: str | None) -> str:
    return (text or "").encode("cp1252", "replace").decode("cp1252")


def duration(seconds: int) -> str:
    h, m = divmod(max(0, int(seconds)) // 60, 60)
    return f"{h}h {m:02d}m" if h else f"{m}m"


def nice_date(iso: str | None) -> str:
    if not iso:
        return "-"
    d = date.fromisoformat(iso)
    return f"{d.day} {calendar.month_abbr[d.month]}"


def month_name(month: str) -> str:
    return f"{calendar.month_name[int(month[5:])]} {month[:4]}"


def clip(text: str, font: str, size: float, width: float) -> str:
    """Cut a line of text with an ellipsis so it never runs past `width`."""
    text = plain(text)
    if stringWidth(text, font, size) <= width:
        return text
    while text and stringWidth(text + "...", font, size) > width:
        text = text[:-1]
    return text.rstrip() + "..."


S = {
    "title": ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=19, textColor=INK, leading=23),
    "sub": ParagraphStyle("sub", fontName="Helvetica", fontSize=9.5, textColor=INK, leading=13),
    "h": ParagraphStyle("h", fontName="Helvetica-Bold", fontSize=10.5, textColor=INK, leading=14, spaceBefore=14, spaceAfter=6),
    "label": ParagraphStyle("label", fontName="Helvetica-Bold", fontSize=7, textColor=MUTED, leading=9),
    "value": ParagraphStyle("value", fontName="Helvetica-Bold", fontSize=19, textColor=INK, leading=23),
    "cell": ParagraphStyle("cell", fontName="Helvetica", fontSize=8, textColor=INK, leading=10.5),
    "head": ParagraphStyle("head", fontName="Helvetica-Bold", fontSize=7.5, textColor=INK, leading=9),
    "small": ParagraphStyle("small", fontName="Helvetica", fontSize=7, textColor=MUTED, leading=9),
    "summary": ParagraphStyle("summary", fontName="Helvetica-Bold", fontSize=15, textColor=INK, leading=21),
    "empty": ParagraphStyle("empty", fontName="Helvetica", fontSize=9, textColor=MUTED, leading=13),
}


def P(text: str, style: str = "cell", **kw) -> Paragraph:
    return Paragraph(text, ParagraphStyle(style, parent=S[style], **kw) if kw else S[style])


DARK = INK
WHITE = colors.white
SOFTW = colors.HexColor("#CFCDDA")  # secondary text on the dark card (about 9:1 on DARK)
FAINTW = colors.HexColor("#46455A")  # tracks on the dark card
CARD = colors.HexColor("#FBFAFD")  # the light cards
PILL = colors.HexColor("#E7E2F2")
SECOND = colors.HexColor("#55525F")  # secondary text on the light cards (about 7:1)
STATUS_COLOR_ON_DARK = {"present": colors.HexColor("#4CC38A"), "wfh": colors.HexColor("#6FA8E0"), "half_day": colors.HexColor("#E3A94B"), "leave": colors.HexColor("#EE7A6E")}
RESULT_COLOR_ON_DARK = {"Early": STATUS_COLOR_ON_DARK["present"], "On time": STATUS_COLOR_ON_DARK["wfh"], "Late": STATUS_COLOR_ON_DARK["leave"], "Pending": colors.HexColor("#A9A7B8")}


def tint(color: colors.Color, amount: float) -> colors.Color:
    """The colour at `amount` strength over white."""
    return colors.Color(1 - (1 - color.red) * amount, 1 - (1 - color.green) * amount, 1 - (1 - color.blue) * amount)


def weekdays_so_far(month: str, state: str) -> int:
    """Working days: the weekdays from the 1st until today, or the whole month once it is finished."""
    y, m = int(month[:4]), int(month[5:])
    last = calendar.monthrange(y, m)[1]
    today = today_local()
    until = min(last, today.day) if state == "in_progress" and today.strftime("%Y-%m") == month else last
    return sum(1 for d in range(1, until + 1) if date(y, m, d).weekday() < 5)


from app.services.report_charts import time_per_day  # noqa: E402


class Chips(Flowable):
    """Present / WFH / Half day / Leave as four chips with their counts; a zero is faded."""

    ROW = 18

    def __init__(self, items: list[tuple[str, int, colors.Color]]):
        super().__init__()
        self.items, self.width = items, 0.0

    def wrap(self, aw, ah):
        self.width = aw
        return aw, self.ROW * 2

    def draw(self):
        c = self.canv
        w = (self.width - 5) / 2
        for i, (label, n, color) in enumerate(self.items):
            x, y = (i % 2) * (w + 5), self.ROW * (1 - i // 2)
            faded = n == 0
            c.setFillColor(colors.HexColor("#F1EFF7"))
            c.roundRect(x, y, w, 15, 7.5, stroke=0, fill=1)
            c.setFillColor(tint(color, 0.35) if faded else color)
            c.circle(x + 8, y + 7.5, 2.8, stroke=0, fill=1)
            c.setFillColor(MUTED if faded else INK)
            c.setFont("Helvetica", 8)
            c.drawString(x + 15, y + 4.8, label)
            c.setFont("Helvetica-Bold", 8)
            c.drawRightString(x + w - 8, y + 4.8, str(n))


class CalendarCells(Flowable):
    """A month calendar (Monday first) whose whole day cells are tinted by status; weekends faded, future days outlined, today ringed."""

    PITCH = 21.0

    def __init__(self, report: ReportOut):
        super().__init__()
        self.report, self.width = report, 0.0
        y, m = int(report.month[:4]), int(report.month[5:])
        self.weeks = calendar.Calendar(0).monthdayscalendar(y, m)

    def wrap(self, aw, ah):
        self.width = aw
        return aw, 14 + self.PITCH * len(self.weeks)

    def draw(self):
        c, rep = self.canv, self.report
        col = self.width / 7
        top = 14 + self.PITCH * len(self.weeks)
        by_day = {int(d.date[8:]): d for d in rep.attendance.days}
        today = today_local().isoformat()
        c.setFont("Helvetica-Bold", 7)
        c.setFillColor(SECOND)
        for i, name in enumerate("MTWTFSS"):
            c.drawCentredString(col * i + col / 2, top - 9, name)
        for r, week in enumerate(self.weeks):
            for i, day in enumerate(week):
                if not day:
                    continue
                rec = by_day.get(day)
                iso = f"{rep.month}-{day:02d}"
                x, y = col * i + 1.5, top - 14 - self.PITCH * (r + 1) + 3
                w, h = col - 3, self.PITCH - 4
                text = INK
                if rec:
                    c.setFillColor(tint(STATUS_COLOR[rec.status], 0.28))
                    c.roundRect(x, y, w, h, 4, stroke=0, fill=1)
                elif iso > today and rep.state == "in_progress":
                    c.setStrokeColor(LINE)
                    c.setLineWidth(0.7)
                    c.roundRect(x, y, w, h, 4, stroke=1, fill=0)
                elif i >= 5:
                    c.setFillColor(colors.HexColor("#F4F3F7"))
                    c.roundRect(x, y, w, h, 4, stroke=0, fill=1)
                    text = colors.HexColor("#A5A2B3")
                else:
                    c.setFillColor(TRACK)
                    c.roundRect(x, y, w, h, 4, stroke=0, fill=1)
                if iso == today and rep.state == "in_progress":
                    c.setStrokeColor(LAVENDER_DARK)
                    c.setLineWidth(1.4)
                    c.roundRect(x, y, w, h, 4, stroke=1, fill=0)
                c.setFillColor(text)
                c.setFont("Helvetica-Bold", 7.5)
                c.drawCentredString(x + w / 2, y + h / 2 - 2.6, str(day))


def files_cell(files) -> str:
    parts = [f"<b>{len(files)}</b>"]
    for f in files[:2]:
        name = safe(clip(f.name, "Helvetica", 7, 100))
        if f.url and re.match(r"^https?://", f.url):
            parts.append(f'<a href="{escape(f.url, {chr(34): "&quot;"})}" color="#2F6FB0"><u>{name}</u></a>')
        else:
            parts.append(name)
    if len(files) > 2:
        parts.append(f"+{len(files) - 2} more")
    return "<br/>".join(parts)


def table(data: list[list], widths: list[float]) -> Table:
    t = Table(data, colWidths=widths, repeatRows=1)
    t.hAlign = "LEFT"
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), LAVENDER),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, SOFT]),
                ("LINEBELOW", (0, 0), (-1, -1), 0.25, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return t


def make_canvas(generated: str, who: str):
    """A canvas that knows the page count, so every footer can say "Page X of Y"."""

    class Numbered(pdfcanvas.Canvas):
        def __init__(self, *a, **k):
            super().__init__(*a, **k)
            self._pages: list[dict] = []

        def showPage(self):
            self._pages.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total = len(self._pages)
            for state in self._pages:
                self.__dict__.update(state)
                self.setFont("Helvetica", 7.5)
                self.setFillColor(MUTED)
                self.drawString(12 * mm, 9 * mm, plain(who))
                self.drawRightString(self._pagesize[0] - 12 * mm, 9 * mm, f"Generated on {generated} · Page {self._pageNumber} of {total}")
                super().showPage()
            super().save()

    return Numbered


def logo_image(logo: bytes | None, max_h: float, max_w: float):
    if not logo:
        return None
    try:
        w, h = ImageReader(io.BytesIO(logo)).getSize()
        scale = min(max_h / h, max_w / w)
        return Image(io.BytesIO(logo), width=w * scale, height=h * scale)
    except Exception:  # not an image reportlab can draw (an SVG, a broken file): the header just goes without it
        return None


STATUS_PDF = {"Early": GREEN, "On time": BLUE, "Late": colors.HexColor("#B35F0A"), "Overdue": RED, "Pending": colors.HexColor("#6E6B7B")}
SORT = {"Overdue": 0, "Late": 1, "Pending": 2, "On time": 3, "Early": 3}
STATUS_WORD = {"present": "Present", "wfh": "WFH", "half_day": "Half", "leave": "Leave"}


def status_text(r) -> str:
    if r.result == "Early":
        return f"Early by {r.early_days}d" if r.early_days else "Early"
    if r.result == "Late":
        return f"Late by {r.late_days}d"
    if r.result == "Overdue":
        return f"Overdue {r.overdue_days}d" if r.overdue_days else "Overdue"
    return r.result


class LoginRows(Flowable):
    """The login log: one compact row per day, "Mon 2 Nov", a status dot and word, the login time ("-" on leave days)."""

    ROW = 13.0

    def __init__(self, rows: list[tuple[str, colors.Color, str, str]]):
        super().__init__()
        self.rows, self.width = rows, 0.0

    def wrap(self, aw, ah):
        self.width = aw
        return aw, self.ROW * len(self.rows)

    def draw(self):
        c, n = self.canv, len(self.rows)
        for i, (day, color, word, when) in enumerate(self.rows):
            y = self.ROW * (n - 1 - i)
            if i:
                c.setStrokeColor(LINE)
                c.setLineWidth(0.4)
                c.line(0, y + self.ROW, self.width, y + self.ROW)
            c.setFillColor(INK)
            c.setFont("Helvetica-Bold", 8)
            c.drawString(0, y + 4, day)
            c.setFillColor(color)
            c.circle(self.width * 0.42, y + 6.5, 2.6, stroke=0, fill=1)
            c.setFillColor(SECOND)
            c.setFont("Helvetica", 8)
            c.drawString(self.width * 0.42 + 8, y + 4, word)
            c.drawRightString(self.width, y + 4, when)


class TaskTime(Flowable):
    """A task and the time spent on it, with a thin bar for its share of the total."""

    HEIGHT = 24.0

    def __init__(self, row, total: int):
        super().__init__()
        self.row, self.total, self.width = row, total, 0.0

    def wrap(self, aw, ah):
        self.width = aw
        return aw, self.HEIGHT

    def draw(self):
        c, r = self.canv, self.row
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 8.5)
        title = clip(r.title, "Helvetica-Bold", 8.5, self.width * 0.55)
        c.drawString(0, 13, title)
        c.setFillColor(SECOND)
        c.setFont("Helvetica", 7)
        c.drawString(stringWidth(title, "Helvetica-Bold", 8.5) + 8, 13.5, clip(f"{r.project} / {r.subfolder}", "Helvetica", 7, self.width * 0.35))
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 8.5)
        c.drawRightString(self.width, 13, nice_time(r.seconds))
        c.setFillColor(TRACK)
        c.roundRect(0, 3, self.width, 2.5, 1.2, stroke=0, fill=1)
        c.setFillColor(LAVENDER_DARK)
        c.roundRect(0, 3, max(3.0, self.width * r.seconds / max(1, self.total)), 2.5, 1.2, stroke=0, fill=1)


def box(content: list, width: float, height: float | None = None) -> Table:
    t = Table([[content]], colWidths=[width], rowHeights=[height] if height else None)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), CARD), ("BOX", (0, 0), (-1, -1), 0.6, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10), ("TOPPADDING", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    return t


def row_of(cells: list, widths: list[float]) -> Table:
    t = Table([cells], colWidths=widths)
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    return t


def label_p(text: str) -> Paragraph:
    return P(safe(text.upper()), "label", textColor=SECOND)


def title_line(text: str, aside: str, width: float) -> Table:
    t = Table([[label_p(text), P(safe(aside), "cell", fontName="Helvetica-Bold", fontSize=9, alignment=2)]], colWidths=[width * 0.6, width * 0.4])
    t.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    return t


def render_pdf(report: ReportOut, logo: bytes | None = None, brand: str = "Task Manager") -> bytes:
    """Landscape A4. Page 1: header, attendance and the login log. Then time tracked (hours per day, time per task), then the task table."""
    buf = io.BytesIO()
    page_w, page_h = landscape(A4)
    margin, bottom = 12 * mm, 16 * mm
    width = page_w - 2 * margin
    gap = 8.0
    doc = BaseDocTemplate(buf, pagesize=landscape(A4), leftMargin=margin, rightMargin=margin, topMargin=margin, bottomMargin=bottom, title=f"Monthly report {report.person.name} {report.month}", author=brand)
    frame = Frame(margin, bottom, width, page_h - margin - bottom, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0, id="body")
    doc.addPageTemplates([PageTemplate(id="page", frames=[frame])])

    p, a, t, tm = report.person, report.attendance, report.tasks, report.time
    month_days = weekdays_so_far(report.month, "final")
    overdue = t.overdue or sum(1 for r in report.rows if r.result == "Overdue")
    late = [r for r in report.rows if r.result == "Late"]
    avg_delay = round(sum(r.late_days for r in late) / len(late), 1) if late else None
    leave = [f"{date.fromisoformat(d.date).day} {calendar.month_abbr[date.fromisoformat(d.date).month]}" for d in a.days if d.status == "leave"]
    story: list = []

    # --- Header and the summary chips ---
    img = logo_image(logo, 8 * mm, 30 * mm)
    head = Table(
        [[[P(safe(p.name), "title", fontSize=16, leading=19), P(safe(f"{p.role.capitalize()}  |  {p.company or 'No company'}  |  {month_name(report.month)}  |  {month_days} working days"), "small", fontSize=8.5, leading=11)],
          img if img else P(safe(brand), "head", alignment=2)]],
        colWidths=[width * 0.8, width * 0.2],
    )
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    chip_data = [f"Overdue  {overdue}", f"Avg delay  {f'{avg_delay:g}d' if avg_delay is not None else '-'}", f"Changes  {report.changes_requested}", "Leave  " + (", ".join(leave) if leave else "-")]
    chips = Table([[P(safe(c), "cell", fontName="Helvetica-Bold", fontSize=8) for c in chip_data]], colWidths=[70, 75, 70, width - 215])
    chips.hAlign = "LEFT"
    chips.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F1EFF7")), ("LEFTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4), ("LINEAFTER", (0, 0), (-2, -1), 5, colors.white)]))
    story += [head, Spacer(1, 5), chips, Spacer(1, 10)]

    # --- Row 1: attendance (calendar + chips) and the login log ---
    cw = (width - gap) / 2
    chip_items = [("Present", a.present, GREEN), ("WFH", a.wfh, BLUE), ("Half day", a.half_day, AMBER), ("Leave", a.leave, RED)]
    row_h = max(LoginRows.ROW * len(a.days) + 44, 230)  # both cards the same height
    att = box([label_p("Attendance"), Spacer(1, 4), Chips(chip_items), Spacer(1, 8), CalendarCells(report)], cw, row_h)
    log_rows = [
        (f"{date.fromisoformat(d.date):%a} {date.fromisoformat(d.date).day} {calendar.month_abbr[date.fromisoformat(d.date).month]}", STATUS_COLOR[d.status], STATUS_WORD[d.status], "-" if d.status == "leave" or not d.login_time else clock12_exact(d.login_time))
        for d in a.days
    ]
    login = [title_line("Login", f"Usual {clock12(a.avg_login)}" if a.avg_login else "", cw - 20), Spacer(1, 6), LoginRows(log_rows) if log_rows else P("No attendance was set this month.", "empty")]
    story.append(row_of([att, "", box(login, cw, row_h)], [cw, gap, cw]))

    # --- Time tracked: hours per day, then each task with its time ---
    heading = [Spacer(1, 12), title_line("Time tracked", nice_time(tm.total_seconds), width), Spacer(1, 6)]
    by_day = {int(d.date[8:]): d.seconds for d in report.time_by_day}
    if tm.total_seconds > 0:
        if by_day:  # the heading stays with its chart
            story.append(KeepTogether(heading + [Image(io.BytesIO(time_per_day(report.month, by_day, width / 72, 2.1)), width=width, height=2.1 * 72), Spacer(1, 6)]))
        else:
            story += heading
        spent = sorted((r for r in report.rows if r.seconds > 0), key=lambda r: -r.seconds)
        story += [TaskTime(r, tm.total_seconds) for r in spent]
    else:
        story += heading + [P("No time tracked this month.", "empty")]

    # --- The task table ---
    story += [Spacer(1, 12), label_p("Tasks"), Spacer(1, 4)]
    rows = sorted(report.rows, key=lambda r: (SORT[r.result], r.due or "9999"))
    if rows:
        w = [width * f for f in (0.27, 0.07, 0.07, 0.09, 0.14, 0.07, 0.06, 0.23)]
        data = [[P(h, "head") for h in ("Task", "Start", "Due", "Completed", "Status", "Time", "Chg", "Files")]]
        for r in rows:
            title = safe(r.title if len(r.title) <= 140 else r.title[:137] + "...")
            sub = safe(clip(f"{r.project} / {r.subfolder}", "Helvetica", 7, w[0] - 10))
            color = hexof(STATUS_PDF[r.result])
            files = P(files_cell(r.files), fontSize=7.5, leading=10) if r.files else ""
            data.append(
                [P(f"<b>{title}</b><br/><font size='7' color='#6E6B7B'>{sub}</font>"), P(nice_date(r.start) if r.start else ""), P(nice_date(r.due) if r.due else ""), P(nice_date(r.completed) if r.completed else ""),
                 P(f'<font color="{color}" size="12">•</font> <b>{safe(status_text(r))}</b>'), P(nice_time(r.seconds) if r.seconds else ""), P(str(r.changes) if r.changes else ""), files]
            )
        story.append(table(data, w))
    else:
        story.append(P("No tasks this month.", "empty"))

    doc.build(story, canvasmaker=make_canvas(f"{report.generated_at:%d %b %Y}", f"{brand}  |  {p.name}  |  {month_name(report.month)}"))
    return buf.getvalue()


def file_name(report: ReportOut) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", f"Monthly-Report-{report.person.name}-{report.month}").strip("-") + ".pdf"


def zip_reports(reports: list[ReportOut], logo: bytes | None = None, brand: str = "Task Manager") -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for r in reports:
            z.writestr(file_name(r), render_pdf(r, logo, brand))
    return out.getvalue()
