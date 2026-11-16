"""The PDF is the same sheet as the Monthly report page: the sums (build_sheet) mirror src/features/reports/sheet.ts."""
from datetime import date, datetime, timezone

from app.schemas.report import Attendance, AttendanceDay, DaySeconds, ReportOut, ReportPerson, TaskRow, TaskTotals, TimeTotals
from app.services.report_pdf import build_sheet, render_pdf, versus_usual


def _row(task_id: str, result: str, **kw) -> TaskRow:
    base = dict(task_id="0" * 23 + task_id, title=f"Task {task_id}", description="d" * 130, project="Acme", subfolder="Design", start="2026-10-01", due="2026-10-10", completed=None, result=result)
    return TaskRow(**{**base, **kw})


def _report() -> ReportOut:
    days = [
        AttendanceDay(date="2026-10-01", status="present", login_time="09:11"),
        AttendanceDay(date="2026-10-02", status="wfh", login_time="10:30"),
        AttendanceDay(date="2026-10-05", status="present", login_time="10:02"),
        AttendanceDay(date="2026-10-06", status="leave", login_time="10:00"),
    ]
    return ReportOut(
        person=ReportPerson(id="0" * 24, name="Mia Member", company="Piixel", role="employee", title="Jr developer"), month="2026-10", state="final", generated_at=datetime(2026, 11, 1, tzinfo=timezone.utc),
        attendance=Attendance(present=7, wfh=2, leave=1, half_day=1, avg_login="10:00", off_dates=["2026-10-03"], days=days), tasks=TaskTotals(assigned=3, completed=2),
        time=TimeTotals(total_seconds=28800, avg_seconds_per_day=0, working_days=4), time_by_day=[DaySeconds(date="2026-10-01", seconds=19800)], summary="In October, Mia was present.",
        rows=[_row("1", "Early", completed="2026-10-07", early_days=3), _row("2", "Late", completed="2026-10-13", late_days=3), _row("3", "Overdue", overdue_days=4), _row("4", "Pending")],
    )


def test_login_is_compared_with_the_usual_one():
    assert versus_usual("10:04", "10:00") == ("On time", "ontime")
    assert versus_usual("09:55", "10:00")[1] == "early"
    assert versus_usual("10:30", "10:00") == ("30m late", "late")
    assert versus_usual("08:55", "10:00") == ("1h 5m early", "early")


def test_sheet_sums_match_the_page():
    s = build_sheet(_report(), date(2026, 11, 5))
    assert (s.working, s.no_status, s.remaining) == (26, 22, 0)  # 31 days, 4 Sundays, 1 other off day
    by = {d.date: d for d in s.days}
    assert by["2026-10-04"].off == "Weekly off" and by["2026-10-03"].off == "Day off"
    assert by["2026-10-02"].vs == ("30m late", "late") and by["2026-10-06"].vs is None
    assert (s.worked, s.late, s.early) == (10, 1, 1)
    assert [r.title for r in s.done] == ["Task 1", "Task 2"] and len(s.overdue) == 1 and len(s.remaining_tasks) == 1
    assert s.upcoming is None and s.present == 7  # the month is over
    mid = build_sheet(_report(), date(2026, 10, 8))  # 26 working days, 6 so far
    assert mid.remaining == 20 and mid.upcoming == ("2026-10-09", "2026-10-31", 20)


def test_pdf_renders_the_sheet():
    pdf = render_pdf(_report())
    assert pdf.startswith(b"%PDF")
    assert render_pdf(_report().model_copy(update={"rows": []})).startswith(b"%PDF")  # no tasks
    assert render_pdf(_report().model_copy(update={"state": "in_progress"})).startswith(b"%PDF")
