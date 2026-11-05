import { api, getErrorMessage } from '../api';
import type { DayStatus } from '../../features/status/statusMeta';

export interface ReportFile {
  name: string;
  kind: 'upload' | 'link';
  /** Links only: uploaded files cannot be opened without signing in. */
  url: string | null;
}

export interface ReportTaskRow {
  task_id: string;
  title: string;
  description: string;
  project: string;
  subfolder: string;
  start: string | null;
  due: string | null;
  completed: string | null;
  result: 'Early' | 'On time' | 'Late' | 'Overdue' | 'Pending';
  late_days: number;
  /** Days before the due date it was finished (0 in older snapshots). */
  early_days?: number;
  /** Not done and this many days past the due date. */
  overdue_days?: number;
  seconds: number;
  changes: number;
  last_change_resolved: string | null;
  files: ReportFile[];
}

export interface MonthlyReport {
  person: { id: string; name: string; company: string; role: string };
  month: string;
  /** "in_progress": the current month, a live preview. "final": a finished month, frozen. */
  state: 'in_progress' | 'final';
  generated_at: string;
  attendance: {
    present: number;
    wfh: number;
    leave: number;
    half_day: number;
    avg_login: string | null;
    earliest_login?: string | null;
    latest_login?: string | null;
    /** Working days so far this month; 0 in snapshots made before it was tracked. */
    scheduled_days?: number;
    off_dates?: string[];
    days: { date: string; status: DayStatus; login_time: string | null }[];
  };
  tasks: { assigned: number; completed: number; early: number; on_time: number; late: number; pending: number; overdue?: number };
  time: { total_seconds: number; avg_seconds_per_day: number; working_days: number };
  changes_requested: number;
  top_tasks: { task_id: string; title: string; seconds: number }[];
  /** Every task with time tracked this month, longest first (missing in older snapshots: use top_tasks). */
  /** Time tracked on each day, and per project / subfolder (missing in older snapshots). */
  time_by_day?: { date: string; seconds: number }[];
  time_by_project?: { name: string; seconds: number }[];
  time_spent?: { task_id: string; title: string; seconds: number }[];
  previous?: { days_worked: number; avg_login: string | null; completed: number; total_seconds: number } | null;
  summary?: string;
  rows: ReportTaskRow[];
}

export interface ReportListRow {
  user_id: string;
  name: string;
  company: string;
  state: 'in_progress' | 'final';
  present: number;
  wfh: number;
  leave: number;
  half_day: number;
  completed: number;
  assigned?: number;
  days_worked?: number;
  scheduled_days?: number;
  avg_login?: string | null;
  summary?: string;
  on_time_pct: number | null;
  total_seconds: number;
}

async function call<T>(fn: () => Promise<{ data: T }>, fallback: string): Promise<T> {
  try {
    return (await fn()).data;
  } catch (err) {
    throw new Error(getErrorMessage(err, fallback));
  }
}

/** Save a file the server sent as a download. */
function save(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

const filenameOf = (disposition: string | undefined, fallback: string) => /filename="?([^";]+)"?/.exec(disposition ?? '')?.[1] ?? fallback;

async function download(url: string, params: Record<string, string | undefined>, fallback: string): Promise<void> {
  try {
    const res = await api.get<Blob>(url, { params, responseType: 'blob' });
    save(res.data, filenameOf(res.headers['content-disposition'], fallback));
  } catch (err) {
    throw new Error(getErrorMessage(err, 'Could not download the report'));
  }
}

export const reportApi = {
  /** Admin: one row per employee. */
  list: (month: string, companyId?: string, q?: string) =>
    call<{ month: string; rows: ReportListRow[] }>(() => api.get('/reports/monthly', { params: { month, company_id: companyId || undefined, q: q || undefined } }), 'Could not load the reports'),
  /** An employee's own report, or (admin) anyone's. */
  get: (userId: string, month: string) => call<MonthlyReport>(() => api.get(`/reports/monthly/${userId}`, { params: { month } }), 'Could not load the report'),
  downloadPdf: (userId: string, month: string) => download(`/reports/monthly/${userId}/pdf`, { month }, `Monthly-Report-${month}.pdf`),
  downloadZip: (month: string, companyId?: string, q?: string) =>
    download('/reports/monthly/all.zip', { month, company_id: companyId || undefined, q: q || undefined }, `Monthly-Reports-${month}.zip`)
};
