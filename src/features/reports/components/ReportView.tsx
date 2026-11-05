import React, { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../../components/ui/Card';
import { Avatar } from '../../../components/ui/Avatar';
import { Skeleton } from '../../../components/ui/Skeleton';
import type { MonthlyReport, ReportTaskRow } from '../../../services/http/reportApi';
import { statusMeta } from '../../status/statusMeta';
import { clock12, clock12Exact, niceTime } from '../reportFormat';

export const monthLabel = (month: string) => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const tint = (color: string | undefined, pct = 22) => `color-mix(in srgb, ${color ?? 'var(--tm-ink-muted)'} ${pct}%, transparent)`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

type Result = ReportTaskRow['result'];
const RESULT_COLOR: Record<Result, string> = {
  Early: 'var(--tm-success)',
  'On time': 'var(--tm-info)',
  Late: 'var(--tm-warning)',
  Overdue: 'var(--tm-danger)',
  Pending: 'var(--tm-ink-muted)'
};
const AXIS = { fontSize: 11, fill: 'var(--tm-ink-soft)' } as const;

/** Working days: the weekdays (Mon-Fri) from the 1st until today, or the whole month once it is finished. */
export function weekdaysIn(month: string, today: Date = new Date()): number {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const until = iso(today).slice(0, 7) === month ? today.getDate() : iso(today).slice(0, 7) < month ? 0 : last;
  let n = 0;
  for (let d = 1; d <= until; d++) {
    const wd = new Date(y, m - 1, d).getDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

const statusText = (r: ReportTaskRow): string => {
  switch (r.result) {
    case 'Early':
      return r.early_days ? `Early by ${r.early_days}d` : 'Early';
    case 'Late':
      return `Late by ${r.late_days}d`;
    case 'Overdue':
      return r.overdue_days ? `Overdue ${r.overdue_days}d` : 'Overdue';
    default:
      return r.result;
  }
};

const Title: React.FC<{ children: React.ReactNode }> = ({ children }) => <h3 className="text-[12px] font-bold uppercase tracking-wider text-[var(--tm-ink-soft)]">{children}</h3>;

const Panel: React.FC<{ title: string; className?: string; aside?: string; children: React.ReactNode }> = ({ title, className = '', aside, children }) => (
  <Card className={className}>
    <div className="flex h-full flex-col p-5">
      <div className="flex items-baseline justify-between gap-3">
        <Title>{title}</Title>
        {aside && <span className="text-[13px] font-extrabold tabular-nums text-[var(--tm-ink)]">{aside}</span>}
      </div>
      <div className="mt-3 flex-1">{children}</div>
    </div>
  </Card>
);

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="py-6 text-[13px] text-[var(--tm-ink-soft)]">{children}</p>;

const Dot: React.FC<{ color?: string; size?: number }> = ({ color, size = 8 }) => <span className="shrink-0 rounded-full" style={{ width: size, height: size, background: color ?? 'var(--tm-border-strong)' }} />;

const tooltipStyle = { background: 'var(--tm-card)', border: '1px solid var(--tm-border)', borderRadius: 10, color: 'var(--tm-ink)', fontSize: 12 } as const;

/** Tinted calendar heatmap plus a chip per status. Whole day cells are coloured; weekends faded, future days outlined, today ringed. */
const AttendancePanel: React.FC<{ report: MonthlyReport }> = ({ report }) => {
  const a = report.attendance;
  const todayIso = iso(new Date());
  const { cells, byDay } = useMemo(() => {
    const [y, m] = report.month.split('-').map(Number);
    const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
    const count = new Date(y, m, 0).getDate();
    return {
      cells: [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)] as (number | null)[],
      byDay: new Map(a.days.map((d) => [Number(d.date.slice(8)), d]))
    };
  }, [report.month, a.days]);
  const chips = [
    { label: 'Present', n: a.present, status: 'present' as const },
    { label: 'WFH', n: a.wfh, status: 'wfh' as const },
    { label: 'Half day', n: a.half_day, status: 'half_day' as const },
    { label: 'Leave', n: a.leave, status: 'leave' as const }
  ];
  return (
    <Panel title="Attendance" className="sm:col-span-1 min-[1100px]:col-span-6">
      <ul className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <li key={c.label} className={`inline-flex items-center gap-1.5 rounded-full bg-[var(--tm-bg-sunken)] px-2.5 py-1 text-[12px] font-bold text-[var(--tm-ink)] ${c.n === 0 ? 'opacity-60' : ''}`}>
            <Dot color={statusMeta(c.status)?.color} />
            {c.label}
            <span className="font-extrabold tabular-nums">{c.n}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <div className="mb-1.5 grid grid-cols-7 gap-1 text-center text-[10.5px] font-bold uppercase text-[var(--tm-ink-soft)]">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <span key={`b${i}`} />;
            const date = `${report.month}-${String(day).padStart(2, '0')}`;
            const rec = byDay.get(day);
            const meta = statusMeta(rec?.status);
            const weekend = i % 7 >= 5;
            const future = date > todayIso;
            const label = rec ? `${meta?.label ?? rec.status}${rec.login_time ? ` · ${clock12Exact(rec.login_time)}` : ''}` : future ? 'Still to come' : weekend ? 'Weekend' : 'No status';
            return (
              <div
                key={day}
                tabIndex={rec ? 0 : -1}
                aria-label={`${day}: ${label}`}
                className={`group relative grid h-9 place-items-center rounded-lg text-[12px] font-bold text-[var(--tm-ink)] ${future && !rec ? 'border border-[var(--tm-border-strong)]' : ''} ${date === todayIso ? 'ring-2 ring-[var(--tm-primary-dark)]' : ''} ${weekend && !rec ? 'opacity-50' : ''}`}
                style={{ background: rec ? tint(meta?.color, 24) : future ? 'transparent' : 'var(--tm-bg-sunken)' }}
              >
                {day}
                {rec && (
                  <span role="tooltip" className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--tm-ink)] px-2 py-1 text-[11px] font-bold text-[var(--tm-card)] group-hover:block group-focus:block">
                    {label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
};

const STATUS_WORD = { present: 'Present', wfh: 'WFH', half_day: 'Half', leave: 'Leave' } as const;
const dayName = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/** A plain table: one row per day with its status and login time. Scrolls after 10 rows. */
const LoginLog: React.FC<{ report: MonthlyReport }> = ({ report }) => {
  const days = report.attendance.days;
  return (
    <Panel title="Login" className="sm:col-span-1 min-[1100px]:col-span-6" aside={report.attendance.avg_login ? `Usual ${clock12(report.attendance.avg_login)}` : undefined}>
      {days.length === 0 ? (
        <Empty>No attendance was set this month.</Empty>
      ) : (
        <div className="max-h-[360px] overflow-y-auto" aria-label="Login by day">
          <table className="w-full">
            <tbody>
              {days.map((d) => {
                const meta = statusMeta(d.status);
                return (
                  <tr key={d.date} className="h-9 border-t border-[var(--tm-border)] text-[13px] first:border-0">
                    <td className="w-32 font-bold text-[var(--tm-ink)]">{dayName(d.date)}</td>
                    <td>
                      <span className="inline-flex items-center gap-2 text-[var(--tm-ink-soft)]">
                        <Dot color={meta?.color} />
                        {STATUS_WORD[d.status] ?? d.status}
                      </span>
                    </td>
                    <td className="text-right tabular-nums text-[var(--tm-ink-soft)]">{d.status === 'leave' || !d.login_time ? '—' : clock12Exact(d.login_time)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
};

/** Time tracked: the total, a bar chart of hours per day (busiest day highlighted) and every task with its time. */
const TimeTracked: React.FC<{ report: MonthlyReport; onOpenTask?: (id: string) => void }> = ({ report, onOpenTask }) => {
  const [y, m] = report.month.split('-').map(Number);
  const count = new Date(y, m, 0).getDate();
  const by = new Map((report.time_by_day ?? []).map((d) => [Number(d.date.slice(8)), d.seconds]));
  const data = Array.from({ length: count }, (_, i) => ({ day: String(i + 1), seconds: by.get(i + 1) ?? 0, hours: (by.get(i + 1) ?? 0) / 3600 }));
  const max = Math.max(...data.map((d) => d.seconds));
  const total = report.time.total_seconds;
  const tasks = useMemo(() => [...report.rows].filter((r) => r.seconds > 0).sort((a, b) => b.seconds - a.seconds), [report.rows]);
  return (
    <Panel title="Time tracked" className="sm:col-span-2 min-[1100px]:col-span-12" aside={niceTime(total)}>
      {total === 0 ? (
        <Empty>No time tracked this month.</Empty>
      ) : (
        <>
          {max > 0 && (
            <div className="h-[220px]" role="img" aria-label="Hours tracked each day">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--tm-border)" vertical={false} />
                  <XAxis dataKey="day" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} width={34} tickFormatter={(v) => `${v}h`} />
                  <Tooltip cursor={{ fill: 'var(--tm-bg-sunken)' }} contentStyle={tooltipStyle} labelFormatter={(d) => `Day ${d}`} formatter={(_, __, p) => [niceTime(p.payload.seconds), 'Tracked']} />
                  <Bar dataKey="hours" radius={[6, 6, 6, 6]} maxBarSize={22} isAnimationActive={false}>
                    {data.map((d) => (
                      <Cell key={d.day} fill={d.seconds === max ? 'var(--primary)' : 'color-mix(in srgb, var(--primary) 38%, var(--surface))'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <ul className="mt-4 space-y-1">
            {tasks.map((r) => (
              <li key={r.task_id}>
                <button type="button" disabled={!onOpenTask} onClick={() => onOpenTask?.(r.task_id)} className="block w-full rounded-md px-1 py-1.5 text-left hover:bg-[var(--tm-bg-sunken)] disabled:cursor-default">
                  <span className="flex items-baseline justify-between gap-4 text-[13px]">
                    <span className="min-w-0">
                      <span className="font-bold text-[var(--tm-ink)]">{r.title}</span>
                      <span className="ml-2 text-[11.5px] text-[var(--tm-ink-soft)]">
                        {r.project} / {r.subfolder}
                      </span>
                    </span>
                    <span className="shrink-0 font-extrabold tabular-nums text-[var(--tm-ink)]">{niceTime(r.seconds)}</span>
                  </span>
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-[var(--tm-bg-sunken)]">
                    <span className="block h-full rounded-full bg-[var(--primary)]" style={{ width: `${Math.max(2, Math.round((r.seconds / total) * 100))}%` }} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
};

const SORT: Record<Result, number> = { Overdue: 0, Late: 1, Pending: 2, 'On time': 3, Early: 3 };
const th = 'whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-extrabold uppercase tracking-wider text-[var(--tm-ink-soft)]';
const td = 'px-3 py-3 align-top text-[12.5px] text-[var(--tm-ink-soft)]';
const chipClass = 'inline-flex items-center rounded-full bg-[var(--tm-primary-soft)] px-2 py-0.5 text-[11.5px] font-extrabold text-[var(--tm-ink)]';

const TaskTable: React.FC<{ rows: ReportTaskRow[]; onOpenTask?: (id: string) => void }> = ({ rows, onOpenTask }) => {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const flip = (key: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const sorted = useMemo(() => [...rows].sort((a, b) => SORT[a.result] - SORT[b.result] || (a.due ?? '9999').localeCompare(b.due ?? '9999')), [rows]);
  return (
    <Panel title="Tasks" className="sm:col-span-2 min-[1100px]:col-span-12">
      {sorted.length === 0 ? (
        <Empty>No tasks this month.</Empty>
      ) : (
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-[var(--tm-border)]">
                {['Task', 'Start', 'Due', 'Completed', 'Status', 'Time', 'Changes', 'Files'].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const changes = `c:${r.task_id}`;
                const files = `f:${r.task_id}`;
                return (
                  <tr key={r.task_id} onClick={() => onOpenTask?.(r.task_id)} className={`border-b border-[var(--tm-border)] last:border-0 ${onOpenTask ? 'cursor-pointer hover:bg-[var(--tm-bg-sunken)]' : ''}`}>
                    <td className={`${td} max-w-[16rem]`}>
                      <span className="block font-bold text-[var(--tm-ink)]">{r.title}</span>
                      <span className="block truncate text-[11.5px]">
                        {r.project} / {r.subfolder}
                      </span>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{r.start ? shortDate(r.start) : ''}</td>
                    <td className={`${td} whitespace-nowrap`}>{r.due ? shortDate(r.due) : ''}</td>
                    <td className={`${td} whitespace-nowrap`}>{r.completed ? shortDate(r.completed) : ''}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-extrabold text-[var(--tm-ink)]" style={{ background: tint(RESULT_COLOR[r.result], 22) }}>
                        <Dot color={RESULT_COLOR[r.result]} size={7} />
                        {statusText(r)}
                      </span>
                    </td>
                    <td className={`${td} whitespace-nowrap tabular-nums`}>{r.seconds > 0 ? niceTime(r.seconds) : ''}</td>
                    <td className={td} onClick={(e) => e.stopPropagation()}>
                      {r.changes > 0 && (
                        <>
                          <button type="button" aria-label={`${plural(r.changes, 'change')}`} aria-expanded={open.has(changes)} onClick={() => flip(changes)} className={chipClass}>
                            {r.changes}
                          </button>
                          {open.has(changes) && (
                            <span className="mt-1.5 block max-w-[10rem] text-[11.5px]">
                              {plural(r.changes, 'change request')}
                              {r.last_change_resolved ? `, last resolved ${shortDate(r.last_change_resolved)}` : ''}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className={td} onClick={(e) => e.stopPropagation()}>
                      {r.files.length > 0 && (
                        <>
                          <button type="button" aria-label={plural(r.files.length, 'file')} aria-expanded={open.has(files)} onClick={() => flip(files)} className={chipClass}>
                            {r.files.length}
                          </button>
                          {open.has(files) && (
                            <ul className="mt-1.5 space-y-0.5">
                              {r.files.map((f, i) => (
                                <li key={i} className="max-w-[12rem] truncate">
                                  {f.url ? (
                                    <a href={f.url} target="_blank" rel="noreferrer noopener" className="font-semibold text-[var(--tm-ink)] underline">
                                      {f.name}
                                    </a>
                                  ) : (
                                    f.name
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
};

/** Admin only: who this is, how many working days the month has, and the numbers an admin looks for first. */
const AdminHeader: React.FC<{ report: MonthlyReport }> = ({ report }) => {
  const late = report.rows.filter((r) => r.result === 'Late');
  const avgDelay = late.length ? Math.round((late.reduce((n, r) => n + r.late_days, 0) / late.length) * 10) / 10 : null;
  const overdue = report.tasks.overdue ?? report.rows.filter((r) => r.result === 'Overdue').length;
  const leave = report.attendance.days.filter((d) => d.status === 'leave').map((d) => shortDate(d.date));
  const chip = 'inline-flex items-center gap-1.5 rounded-full bg-[var(--tm-bg-sunken)] px-3 py-1 text-[12.5px] font-bold text-[var(--tm-ink)]';
  return (
    <Card className="sm:col-span-2 min-[1100px]:col-span-12">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 p-5">
        <div className="flex min-w-[14rem] items-center gap-3">
          <Avatar name={report.person.name} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-[17px] font-extrabold text-[var(--tm-ink)]">{report.person.name}</p>
            <p className="text-[12.5px] text-[var(--tm-ink-soft)]">
              <span className="capitalize">{report.person.role}</span> · {report.person.company || 'No company'} · {monthLabel(report.month)} · {plural(weekdaysIn(report.month, new Date(2999, 0, 1)), 'working day')}
            </p>
          </div>
        </div>
        <ul className="flex flex-wrap gap-1.5">
          <li className={chip}>
            <Dot color={RESULT_COLOR.Overdue} /> Overdue <span className="font-extrabold tabular-nums">{overdue}</span>
          </li>
          <li className={chip}>
            Avg delay <span className="font-extrabold tabular-nums">{avgDelay === null ? '-' : `${avgDelay}d`}</span>
          </li>
          <li className={chip}>
            Changes <span className="font-extrabold tabular-nums">{report.changes_requested}</span>
          </li>
          <li className={chip}>
            Leave <span className="font-extrabold">{leave.length ? leave.join(', ') : '-'}</span>
          </li>
        </ul>
      </div>
    </Card>
  );
};

const GRID = 'grid items-stretch gap-4 grid-cols-1 sm:grid-cols-2 min-[1100px]:grid-cols-12';

/** Placeholder with the same shape as the report, shown while it loads. */
export const ReportSkeleton: React.FC = () => (
  <div className={GRID} aria-busy="true" aria-label="Loading the report">
    <Skeleton className="h-96 w-full min-[1100px]:col-span-6" />
    <Skeleton className="h-96 w-full min-[1100px]:col-span-6" />
    <Skeleton className="h-72 w-full sm:col-span-2 min-[1100px]:col-span-12" />
    <Skeleton className="h-60 w-full sm:col-span-2 min-[1100px]:col-span-12" />
  </div>
);

/** One employee's month: attendance and the login log, time tracked, then the task table. */
export const ReportView: React.FC<{ report: MonthlyReport; onOpenTask?: (taskId: string) => void; admin?: boolean }> = ({ report, onOpenTask, admin }) => (
  <div className={GRID}>
    {admin && <AdminHeader report={report} />}
    <AttendancePanel report={report} />
    <LoginLog report={report} />
    <TimeTracked report={report} onOpenTask={onOpenTask} />
    <TaskTable rows={report.rows} onOpenTask={onOpenTask} />
  </div>
);
