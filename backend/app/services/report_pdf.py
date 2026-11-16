"""The monthly report as a printable PDF (portrait A4): the same sheet as the Monthly report page.

Header, attendance summary, daily login record, then the task report (done / overdue / remaining).
`build_sheet` does the same sums as `src/features/reports/sheet.ts`; keep the two in step.
"""
import calendar
import io
import re
import zipfile
from dataclasses import dataclass, field
from datetime import date
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import BaseDocTemplate, Flowable, Frame, Image, KeepTogether, PageTemplate, Paragraph, Spacer, Table, TableStyle

from app.core.timeutil import today_local
from app.schemas.report import ReportOut
from app.services.monthly_report import clock12, clock12_exact, nice_time

INK = colors.HexColor("#2A2933")
MUTED = colors.HexColor("#6E6B7B")
SECOND = colors.HexColor("#55525F")
LINE = colors.HexColor("#E4E0EF")
SOFT = colors.HexColor("#F6F4FB")
HEAD = colors.HexColor("#ECE9F4")
GREEN = colors.HexColor("#2F8F5B")
BLUE = colors.HexColor("#2F6FB0")
AMBER = colors.HexColor("#B35F0A")
RED = colors.HexColor("#C0392B")
GREY = colors.HexColor("#6E6B7B")

STATUS_WORD = {"present": "Present", "wfh": "WFH", "half_day": "Half day", "leave": "Leave"}
STATUS_COLOR = {"present": GREEN, "wfh": BLUE, "half_day": AMBER, "leave": RED}
RESULT_COLOR = {"Early": GREEN, "On time": GREEN, "Late": AMBER, "Overdue": RED, "Pending": GREY}
GROUP_OF = {"Early": "done", "On time": "done", "Late": "done", "Overdue": "overdue", "Pending": "remaining"}
ON_TIME_MINUTES = 5  # a login within this many minutes of the usual one counts as on time


# ---------------------------------------------------------------- the sums (mirrors sheet.ts)

@dataclass
class DayRow:
    date: str
    label: str  # "1 Oct"
    weekday: str  # "Thu"
    status: str | None
    off: str | None  # "Weekly off" | "Day off"
    login: str | None
    vs: tuple[str, str] | None  # (text, "early" | "ontime" | "late")
    seconds: int


@dataclass
class Sheet:
    working: int = 0
    no_status: int = 0
    remaining: int = 0
    days: list[DayRow] = field(default_factory=list)
    worked: int = 0
    present: int = 0
    upcoming: tuple[str, str, int] | None = None  # first day to come, last day, working days among them
    late: int = 0
    early: int = 0
    done: list = field(default_factory=list)
    overdue: list = field(default_factory=list)
    remaining_tasks: list = field(default_factory=list)


def _minutes(hhmm: str) -> int:
    return int(hhmm[:2]) * 60 + int(hhmm[3:5])


def versus_usual(login: str, usual: str) -> tuple[str, str]:
    """("5m late", "late"), ("1h 5m early", "early") or ("On time", "ontime")."""
    d = _minutes(login) - _minutes(usual)
    if abs(d) < ON_TIME_MINUTES:
        return "On time", "ontime"
    return (f"{nice_time(-d * 60)} early", "early") if d < 0 else (f"{nice_time(d * 60)} late", "late")


def build_sheet(report: ReportOut, today: date | None = None) -> Sheet:
    today = today or today_local()
    y, m = int(report.month[:4]), int(report.month[5:])
    a = report.attendance
    off = set(a.off_dates)
    by_date = {d.date: d for d in a.days}
    tracked = {d.date: d.seconds for d in report.time_by_day}
    s = Sheet()
    sofar = 0
    first_future: str | None = None
    for n in range(1, calendar.monthrange(y, m)[1] + 1):
        d = date(y, m, n)
        iso = d.isoformat()
        sunday = d.weekday() == 6
        day_off = sunday or iso in off
        future = d > today
        if not day_off:
            s.working += 1
            if not future:
                sofar += 1
        if future:
            first_future = first_future or iso
            continue
        base = dict(date=iso, label=f"{n} {calendar.month_abbr[m]}", weekday=calendar.day_abbr[d.weekday()][:3], seconds=tracked.get(iso, 0))
        rec = by_date.get(iso)
        if rec:
            has_login = rec.status != "leave" and bool(rec.login_time)
            vs = versus_usual(rec.login_time, a.avg_login) if has_login and a.avg_login else None
            s.late += vs is not None and vs[1] == "late"
            s.early += vs is not None and vs[1] == "early"
            s.days.append(DayRow(**base, status=rec.status, off=None, login=clock12_exact(rec.login_time) if has_login else None, vs=vs))
        elif day_off:
            s.days.append(DayRow(**base, status=None, off="Weekly off" if sunday else "Day off", login=None, vs=None))
        else:
            s.no_status += 1
            s.days.append(DayRow(**base, status=None, off=None, login=None, vs=None))
    s.remaining = s.working - sofar
    s.worked = a.present + a.wfh + a.half_day
    s.present = a.present
    if first_future:
        s.upcoming = (first_future, date(y, m, calendar.monthrange(y, m)[1]).isoformat(), s.remaining)
    groups = {"done": s.done, "overdue": s.overdue, "remaining": s.remaining_tasks}
    key = lambda r: (r.completed or r.due if GROUP_OF[r.result] == "done" else r.due) or "9999"  # noqa: E731
    for r in sorted(report.rows, key=key):
        groups[GROUP_OF[r.result]].append(r)
    return s


# ---------------------------------------------------------------- drawing

def safe(text: str | None) -> str:
    """Text the built-in PDF fonts can draw (Western characters; anything else becomes ?), escaped for Paragraph markup."""
    return escape((text or "").encode("cp1252", "replace").decode("cp1252"))


def plain(text: str | None) -> str:
    return (text or "").encode("cp1252", "replace").decode("cp1252")


def plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def clip(text: str, n: int) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= n else text[: n - 1].rstrip() + "…"


def short_date(iso: str | None) -> str:
    if not iso:
        return "—"
    d = date.fromisoformat(iso)
    return f"{d.day} {calendar.month_abbr[d.month]}"


def month_name(month: str) -> str:
    return f"{calendar.month_name[int(month[5:])]} {month[:4]}"


def hexof(c) -> str:
    return "#" + c.hexval()[2:]


def P(text: str, size: float = 8.5, bold: bool = False, color=INK, align: int = 0, leading: float | None = None) -> Paragraph:
    return Paragraph(text, ParagraphStyle("p", fontName="Helvetica-Bold" if bold else "Helvetica", fontSize=size, leading=leading or size * 1.3, textColor=color, alignment=align))


def box_style(extra: list | None = None) -> TableStyle:
    return TableStyle(
        [
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            *(extra or []),
        ]
    )


def grid(data: list[list], widths: list[float], footer: bool = False) -> Table:
    t = Table(data, colWidths=widths, repeatRows=1)
    t.hAlign = "LEFT"
    extra = [("BACKGROUND", (0, 0), (-1, 0), HEAD), ("LINEBELOW", (0, 1), (-1, -1), 0.3, LINE), ("BOX", (0, 0), (-1, -1), 0.5, LINE)]
    if footer:
        extra += [("BACKGROUND", (0, -1), (-1, -1), HEAD), ("LINEABOVE", (0, -1), (-1, -1), 0.8, MUTED)]
    t.setStyle(box_style(extra))
    return t


class Pill(Flowable):
    """A small rounded label (a status), drawn inside a table cell."""

    def __init__(self, text: str, fg, bg, size: float = 7.5):
        super().__init__()
        self.text, self.fg, self.bg, self.size = plain(text), fg, bg, size
        self.w = stringWidth(self.text, "Helvetica-Bold", size) + 12

    def wrap(self, aw, ah):
        return self.w, self.size + 7

    def draw(self):
        c = self.canv
        c.setFillColor(self.bg)
        c.roundRect(0, 0, self.w, self.size + 6, (self.size + 6) / 2, stroke=0, fill=1)
        c.setFillColor(self.fg)
        c.setFont("Helvetica-Bold", self.size)
        c.drawString(6, 3.6, self.text)


class SectionTitle(Flowable):
    """A charcoal numbered circle (or a coloured dot) and the title; an aside sits on the right."""

    def __init__(self, text: str, width: float, n: int | None = None, dot=None, aside: str = ""):
        super().__init__()
        self.text, self.width, self.n, self.dot, self.aside = plain(text), width, n, dot, plain(aside)

    def wrap(self, aw, ah):
        return self.width, 22

    def draw(self):
        c, x = self.canv, 0.0
        if self.n is not None:
            c.setFillColor(INK)
            c.circle(7.5, 9, 7.5, stroke=0, fill=1)
            c.setFillColor(colors.white)
            c.setFont("Helvetica-Bold", 8)
            c.drawCentredString(7.5, 6.3, str(self.n))
            x = 21
        elif self.dot is not None:
            c.setFillColor(self.dot)
            c.circle(4, 9, 4, stroke=0, fill=1)
            x = 15
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(x, 5, self.text)
        if self.aside:
            c.setFillColor(SECOND)
            c.setFont("Helvetica-Bold", 8.5)
            c.drawRightString(self.width, 5, self.aside)


def tiles(items: list[tuple[str, str, object]], width: float, tinted: int | None = None, muted: str | None = None) -> Table:
    """One bordered strip: each cell has its label above its number, cells divided by thin lines."""
    n = len(items)
    cells = [[[P(safe(label), 7.5, color=MUTED), P(f'<font color="{hexof(MUTED if label == muted else color)}">{safe(value)}</font>', 16, True, leading=20)] for label, value, color in items]]
    t = Table(cells, colWidths=[width / n] * n, hAlign="LEFT")
    style = [("BOX", (0, 0), (-1, -1), 0.6, LINE), ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 7)]
    if tinted is not None:
        style.append(("BACKGROUND", (tinted, 0), (tinted, 0), HEAD))
    t.setStyle(box_style(style))
    return t


def heading(text: str, width: float, n: int | None = None, dot=None, aside: str = "") -> SectionTitle:
    return SectionTitle(text, width, n, dot, aside)


def make_canvas(left: str, right: str):
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
                self.setStrokeColor(LINE)
                self.setLineWidth(0.5)
                self.line(12 * mm, 13 * mm, self._pagesize[0] - 12 * mm, 13 * mm)
                self.setFont("Helvetica", 7.5)
                self.setFillColor(MUTED)
                self.drawString(12 * mm, 9 * mm, plain(left))
                self.drawRightString(self._pagesize[0] - 12 * mm, 9 * mm, plain(f"{right}  ·  Page {self._pageNumber} of {total}"))
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


def status_text(r) -> str:
    if r.result == "Early":
        return f"Early by {r.early_days}d" if r.early_days else "Early"
    if r.result == "Late":
        return f"Late by {r.late_days}d"
    if r.result == "Overdue":
        return f"Overdue {r.overdue_days}d" if r.overdue_days else "Overdue"
    return r.result


VS_COLOR = {"early": GREEN, "ontime": SECOND, "late": RED}
PILL_COLORS = {
    "present": (GREEN, colors.HexColor("#E3F4EA")),
    "wfh": (BLUE, colors.HexColor("#E2EDF8")),
    "half_day": (AMBER, colors.HexColor("#FBEBD6")),
    "leave": (RED, colors.HexColor("#F9E2DF")),
    None: (GREY, colors.HexColor("#ECEBF1")),
}


def login_table(report: ReportOut, s: Sheet, width: float) -> Table:
    w = [width * f for f in (0.16, 0.1, 0.26, 0.2, 0.28)]
    dash = '<font color="#6E6B7B">—</font>'
    data = [[P(h, 7.5, True, SECOND) for h in ("Date", "Day", "Status", "Login time", "vs usual")]]
    greyed: list[int] = []
    for i, d in enumerate(s.days, start=1):
        if d.status:
            status = Pill(STATUS_WORD[d.status], *PILL_COLORS[d.status])
        elif d.off:
            status = P(f'<font color="#6E6B7B"><i>{d.off}</i></font>', 8)
            greyed.append(i)
        else:
            status = Pill("No status", *PILL_COLORS[None])
        vs = f'<font color="{hexof(VS_COLOR[d.vs[1]])}">{"<b>" if d.vs[1] == "late" else ""}{safe(d.vs[0])}{"</b>" if d.vs[1] == "late" else ""}</font>' if d.vs else dash
        data.append([P(f"<b>{d.label}</b>", 8), P(d.weekday, 8), status, P(d.login or dash, 8), P(vs, 8)])
    spans: list = []
    if s.upcoming:
        first, last, working = s.upcoming
        f, l = date.fromisoformat(first), date.fromisoformat(last)
        span = f"{f.day} – {l.day} {calendar.month_abbr[l.month]}" if f != l else f"{f.day} {calendar.month_abbr[f.month]}"
        data.append([P(f"<i>{span} · {plural(working, 'working day')} remaining</i>", 8, color=MUTED), "", "", "", ""])
        spans.append(("SPAN", (0, len(data) - 1), (-1, len(data) - 1)))
    data.append([P(f"<b>Month to date · {s.present} present · {s.late} late</b>", 8), "", "", "", ""])
    spans.append(("SPAN", (0, len(data) - 1), (-1, len(data) - 1)))
    t = grid(data, w, footer=True)
    t.setStyle(TableStyle([*spans, *[("BACKGROUND", (0, r), (-1, r), SOFT) for r in greyed], ("TOPPADDING", (0, 1), (-1, -2), 2.5), ("BOTTOMPADDING", (0, 1), (-1, -2), 2.5), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    return t


def task_table(rows: list, date_label: str, date_of, width: float) -> Table:
    date_w, status_w = 83.0, 90.0  # 110px and 120px
    w = [width * 0.34, width * 0.66 - date_w - status_w, date_w, status_w]
    data = [[P(h, 7.5, True, SECOND) for h in ("Task", "Description", date_label, "Status")]]
    for r in rows:
        extras = [x for x in (f"{nice_time(r.seconds)} tracked" if r.seconds else "", plural(r.changes, "change") if r.changes else "", plural(len(r.files), "file") if r.files else "") if x]
        cell = [P(f"<b>{safe(clip(r.title, 120))}</b>", 8.5), P(safe(f"{r.project} › {r.subfolder}"), 7.5, color=MUTED)]
        if extras:
            cell.append(P(safe(" · ".join(extras)), 7, color=MUTED))
        color = hexof(RESULT_COLOR[r.result])
        data.append([cell, P(safe(clip(r.description, 100)) or '<font color="#6E6B7B">—</font>', 8, color=SECOND), P(short_date(date_of(r)), 8), P(f'<font color="{color}" size="11">•</font> <b>{safe(status_text(r))}</b>', 8)])
    return grid(data, w)


def render_pdf(report: ReportOut, logo: bytes | None = None, brand: str = "Task Manager") -> bytes:
    buf = io.BytesIO()
    page_w, page_h = A4
    margin, bottom = 12 * mm, 18 * mm
    width = page_w - 2 * margin
    p = report.person
    doc = BaseDocTemplate(buf, pagesize=A4, leftMargin=margin, rightMargin=margin, topMargin=margin, bottomMargin=bottom, title=f"Monthly report {p.name} {report.month}", author=brand)
    doc.addPageTemplates([PageTemplate(id="page", frames=[Frame(margin, bottom, width, page_h - margin - bottom, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0, id="body")])])

    s = build_sheet(report)
    a = report.attendance
    story: list = []

    # --- Header: label + month on the left, the facts on the right, a 2pt charcoal line ---
    img = logo_image(logo, 8 * mm, 30 * mm)
    mo, yr = int(report.month[5:]), report.month[:4]
    period = f"1 – {calendar.monthrange(int(yr), mo)[1]} {calendar.month_abbr[mo]} {yr}"
    gen = report.generated_at
    generated = f"{gen.day} {calendar.month_name[gen.month]} {gen.year}" + (" · in progress" if report.state == "in_progress" else "")
    facts = Table(
        [[P(label, 8, color=MUTED), P(safe(value), 8.5, True)] for label, value in (("Employee", p.name), ("Role", p.title or p.role.capitalize()), ("Period", period), ("Generated", generated))],
        colWidths=[50, width * 0.4 - 50],
    )
    facts.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    left = [P("MONTHLY REPORT", 7.5, True, MUTED), P(safe(month_name(report.month)), 22, True, leading=27)]
    if img:
        left.insert(0, img)
    head = Table([[left, facts]], colWidths=[width * 0.6, width * 0.4])
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "BOTTOM"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 8), ("LINEBELOW", (0, 0), (-1, 0), 2, INK)]))
    story += [head, Spacer(1, 14)]

    # --- 1. Attendance summary ---
    story.append(heading("Attendance summary", width, n=1))
    story.append(
        tiles(
            [
                ("Working days", str(s.working), INK),
                ("Present", str(a.present), INK),
                ("WFH", str(a.wfh), INK),
                ("Half day", str(a.half_day), INK),
                ("Leave", str(a.leave), INK),
                ("No status", str(s.no_status), AMBER if s.no_status else INK),
                ("Remaining", str(s.remaining), INK),
            ],
            width,
            tinted=0,
            muted="Remaining",
        )
    )
    if report.summary:
        story += [Spacer(1, 5), P(safe(report.summary), 8.5, color=SECOND)]
    story.append(Spacer(1, 14))

    # --- 2. Daily login record ---
    story += [heading("Daily login record", width, n=2, aside=f"Usual login {clock12(a.avg_login)}" if a.avg_login else ""), Spacer(1, 3), login_table(report, s, width), Spacer(1, 14)]

    # --- 3. Task report ---
    story += [heading("Task report", width, n=3), Spacer(1, 3)]
    if not report.rows:
        story.append(P("No tasks this month.", 9, color=MUTED))
    else:
        story += [
            tiles([("Total", str(len(report.rows)), INK), ("Done", str(len(s.done)), GREEN), ("Overdue", str(len(s.overdue)), RED if s.overdue else INK), ("Remaining", str(len(s.remaining_tasks)), INK)], width),
            Spacer(1, 10),
        ]
        for name, rows, label, of, dot in (
            ("Done", s.done, "Completed", lambda r: r.completed, GREEN),
            ("Overdue", s.overdue, "Due", lambda r: r.due, RED),
            ("Remaining", s.remaining_tasks, "Due", lambda r: r.due, colors.HexColor("#A894D6")),
        ):
            head = heading(f"{name} · {len(rows)}", width, dot=dot)
            story.append(KeepTogether([head, task_table(rows, label, of, width)]) if rows else KeepTogether([head, P("Nothing here.", 8.5, color=MUTED)]))
            story.append(Spacer(1, 10))

    doc.build(story, canvasmaker=make_canvas(f"Task Manager · {p.company or 'No company'}", f"{p.name} · {month_name(report.month)}"))
    return buf.getvalue()


def file_name(report: ReportOut) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", f"Monthly-Report-{report.person.name}-{report.month}").strip("-") + ".pdf"


def zip_reports(reports: list[ReportOut], logo: bytes | None = None, brand: str = "Task Manager") -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for r in reports:
            z.writestr(file_name(r), render_pdf(r, logo, brand))
    return out.getvalue()
