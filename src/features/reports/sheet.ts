import type { MonthlyReport, ReportTaskRow } from '../../services/http/reportApi';
import type { DayStatus } from '../status/statusMeta';
import { clock12Exact, niceTime } from './reportFormat';

/**
 * Everything the report sheet shows that is worked out from the report (not stored in it).
 * `backend/app/services/report_pdf.py` (`build_sheet`) does the same sums for the PDF; keep the two in step.
 */

export const STATUS_WORD: Record<DayStatus, string> = { present: 'Present', wfh: 'WFH', half_day: 'Half day', leave: 'Leave' };
/** A login within this many minutes of the usual one counts as on time. */
export const ON_TIME_MINUTES = 5;

export type VsTone = 'early' | 'ontime' | 'late';

export interface DayRow {
  date: string;
  /** "1 Oct" */
  dateLabel: string;
  /** "Thu" */
  weekday: string;
  /** Set for a day with a status; otherwise the day is a day off or has no status. */
  status: DayStatus | null;
  off: 'Weekly off' | 'Day off' | null;
  login: string | null;
  vs: { text: string; tone: VsTone } | null;
  seconds: number;
}

export interface AttendanceSummary {
  working: number;
  present: number;
  wfh: number;
  halfDay: number;
  leave: number;
  noStatus: number;
  remaining: number;
}

export interface Sheet {
  summary: AttendanceSummary;
  days: DayRow[];
  totals: { worked: number; present: number; late: number; early: number; seconds: number };
  /** The days still to come this month (an unfinished month only). */
  upcoming: { from: string; to: string; working: number } | null;
  tasks: { done: ReportTaskRow[]; overdue: ReportTaskRow[]; remaining: ReportTaskRow[] };
}

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "5m late", "1h 5m early", "On time". */
export function versusUsual(login: string, usual: string): { text: string; tone: VsTone } {
  const d = minutesOf(login) - minutesOf(usual);
  if (Math.abs(d) < ON_TIME_MINUTES) return { text: 'On time', tone: 'ontime' };
  return d < 0 ? { text: `${niceTime(-d * 60)} early`, tone: 'early' } : { text: `${niceTime(d * 60)} late`, tone: 'late' };
}

export const GROUP_OF: Record<ReportTaskRow['result'], 'done' | 'overdue' | 'remaining'> = {
  Early: 'done',
  'On time': 'done',
  Late: 'done',
  Overdue: 'overdue',
  Pending: 'remaining'
};

export function buildSheet(report: MonthlyReport, today: Date = new Date()): Sheet {
  const [y, m] = report.month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const todayIso = isoOf(today);
  const a = report.attendance;
  const off = new Set(a.off_dates ?? []);
  const byDate = new Map(a.days.map((d) => [d.date, d]));
  const tracked = new Map((report.time_by_day ?? []).map((d) => [d.date, d.seconds]));

  const days: DayRow[] = [];
  let working = 0;
  let sofar = 0;
  let noStatus = 0;
  let late = 0;
  let early = 0;
  let firstFuture: string | null = null;
  for (let n = 1; n <= last; n++) {
    const date = `${report.month}-${pad(n)}`;
    const wd = new Date(y, m - 1, n).getDay();
    const dayOff = wd === 0 || off.has(date);
    const future = date > todayIso;
    if (!dayOff) {
      working++;
      if (!future) sofar++;
    }
    if (future) {
      firstFuture ??= date;
      continue;
    }
    const rec = byDate.get(date);
    const base = { date, dateLabel: `${n} ${MONTHS[m - 1]}`, weekday: WEEKDAYS[wd], seconds: tracked.get(date) ?? 0 };
    if (rec) {
      const hasLogin = rec.status !== 'leave' && !!rec.login_time;
      const vs = hasLogin && a.avg_login ? versusUsual(rec.login_time!, a.avg_login) : null;
      if (vs?.tone === 'late') late++;
      if (vs?.tone === 'early') early++;
      days.push({ ...base, status: rec.status, off: null, login: hasLogin ? clock12Exact(rec.login_time) : null, vs });
    } else if (dayOff) {
      days.push({ ...base, status: null, off: wd === 0 ? 'Weekly off' : 'Day off', login: null, vs: null });
    } else {
      noStatus++;
      days.push({ ...base, status: null, off: null, login: null, vs: null });
    }
  }

  const tasks: Sheet['tasks'] = { done: [], overdue: [], remaining: [] };
  const key = (r: ReportTaskRow) => (GROUP_OF[r.result] === 'done' ? (r.completed ?? r.due) : r.due) ?? '9999';
  for (const r of [...report.rows].sort((p, q) => key(p).localeCompare(key(q)))) tasks[GROUP_OF[r.result]].push(r);

  return {
    summary: { working, present: a.present, wfh: a.wfh, halfDay: a.half_day, leave: a.leave, noStatus, remaining: working - sofar },
    days,
    upcoming: firstFuture ? { from: firstFuture, to: `${report.month}-${pad(last)}`, working: working - sofar } : null,
    totals: { worked: a.present + a.wfh + a.half_day, present: a.present, late, early, seconds: report.time.total_seconds },
    tasks
  };
}
