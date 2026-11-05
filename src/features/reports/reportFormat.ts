import type { MonthlyReport } from '../../services/http/reportApi';

/** "13:17" -> "1:15 PM": 12-hour, rounded to the nearest 5 minutes. */
export function clock12(hhmm: string | null | undefined): string {
  if (!hhmm) return '-';
  const total = (Math.round((Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))) / 5) * 5) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "13:07" -> "1:07 PM" (exact, 12-hour). */
export function clock12Exact(hhmm: string | null | undefined): string {
  if (!hhmm) return '-';
  const h = Number(hhmm.slice(0, 2));
  return `${h % 12 || 12}:${hhmm.slice(3, 5)} ${h < 12 ? 'AM' : 'PM'}`;
}

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** 37m, 2h 15m, 24h. Never seconds. */
export function niceTime(seconds: number): string {
  const mins = Math.max(0, Math.floor(seconds / 60));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
}

export const daysWorked = (r: MonthlyReport) => r.attendance.present + r.attendance.wfh + r.attendance.half_day;

/** "4 / 4" (days worked of working days so far), or just the count for older snapshots that do not know the working days. */
export function presentOf(r: MonthlyReport): { worked: number; of: number | null } {
  const worked = daysWorked(r);
  return { worked, of: r.attendance.scheduled_days ? Math.max(worked, r.attendance.scheduled_days) : null };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The small grey "vs last month" lines. Each is null (hidden) when there is no last month to compare with. */
export function versusLastMonth(r: MonthlyReport) {
  const p = r.previous;
  if (!p) return { days: null, login: null, completed: null, time: null };
  const signed = (n: number, text: string) => (n === 0 ? 'Same as last month' : `${n > 0 ? '+' : '-'}${text} vs last month`);
  const dDays = daysWorked(r) - p.days_worked;
  const dDone = r.tasks.completed - p.completed;
  const dTime = r.time.total_seconds - p.total_seconds;
  let login: string | null = null;
  if (r.attendance.avg_login && p.avg_login) {
    const d = minutesOf(r.attendance.avg_login) - minutesOf(p.avg_login);
    login = Math.abs(d) < 5 ? 'About the same as last month' : `${niceTime(Math.abs(d) * 60)} ${d < 0 ? 'earlier' : 'later'} than last month`;
  }
  return {
    days: signed(dDays, plural(Math.abs(dDays), 'day')),
    login,
    completed: signed(dDone, String(Math.abs(dDone))),
    time: Math.abs(dTime) < 60 ? 'Same as last month' : signed(dTime, niceTime(Math.abs(dTime)))
  };
}
