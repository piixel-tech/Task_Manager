import React, { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Skeleton } from '../../../components/ui/Skeleton';
import { BackButton } from '../../../components/ui/BackButton';
import type { MonthlyReport, ReportTaskRow } from '../../../services/http/reportApi';
import { clock12, niceTime } from '../reportFormat';
import { buildSheet, STATUS_WORD, type DayRow, type Sheet, type VsTone } from '../sheet';

export const monthLabel = (month: string) => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const dayOf = (iso: string) => Number(iso.slice(8));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const clip = (text: string, n: number) => (text.length > n ? `${text.slice(0, n - 1).trimEnd()}…` : text);

/** "1 – 30 Nov 2026" */
export function periodLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `1 – ${last} ${new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short' })} ${y}`;
}

/** "17 – 30 Nov" */
const rangeLabel = (from: string, to: string) =>
  from === to ? shortDate(from) : `${dayOf(from)} – ${dayOf(to)} ${new Date(`${to}T00:00:00`).toLocaleDateString('en-GB', { month: 'short' })}`;

const SIDE_CARD = 'rounded-[var(--tm-radius-card)] border border-[var(--tm-border)]/60 bg-[var(--tm-card)] p-4 shadow-soft-xs';
const SECTION_TITLE = 'text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--tm-ink-muted)]';
const TH = 'whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--tm-ink-muted)]';
const TD = 'px-3 py-2.5 align-top text-[13px] text-[var(--tm-ink-soft)]';
const PILL = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold leading-none';

const VS_CLASS: Record<VsTone, string> = { early: 'text-[var(--tm-success)]', ontime: 'text-[var(--tm-ink-soft)]', late: 'font-bold text-[var(--tm-danger)]' };

const DAY_PILL: Record<string, string> = {
  present: 'bg-[var(--tm-success-bg)] text-[var(--tm-success)]',
  wfh: 'bg-[var(--tm-info-bg)] text-[var(--tm-info)]',
  half_day: 'bg-[var(--tm-warning-bg)] text-[var(--tm-warning)]',
  leave: 'bg-[var(--tm-danger-bg)] text-[var(--tm-danger)]',
  none: 'bg-[var(--tm-neutral-bg)] text-[var(--tm-neutral)]'
};

const RESULT_TONE: Record<ReportTaskRow['result'], string> = {
  Early: 'bg-[var(--tm-success-bg)] text-[var(--tm-success)]',
  'On time': 'bg-[var(--tm-success-bg)] text-[var(--tm-success)]',
  Late: 'bg-[var(--tm-warning-bg)] text-[var(--tm-warning)]',
  Overdue: 'bg-[var(--tm-danger-bg)] text-[var(--tm-danger)]',
  Pending: 'bg-[var(--tm-neutral-bg)] text-[var(--tm-neutral)]'
};

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

const jump = (id: string) => document.getElementById(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });

/** Left column: the page's controls, the section links and the totals. Right column: the report sheet. */
const Layout: React.FC<{ controls?: React.ReactNode; side?: React.ReactNode; children: React.ReactNode }> = ({ controls, side, children }) => (
  <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
    <aside className="space-y-4 lg:sticky lg:top-4">
      {controls}
      {side}
    </aside>
    <div className="min-w-0">{children}</div>
  </div>
);

/** Placeholder with the same shape as the report, shown while it loads. */
export const ReportSkeleton: React.FC<{ controls?: React.ReactNode }> = ({ controls }) => (
  <Layout controls={controls} side={<Skeleton className="h-60 w-full" />}>
    <div aria-busy="true" aria-label="Loading the report" className="space-y-4">
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-96 w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  </Layout>
);

/** The charcoal numbered circle in front of a section name. */
const Badge: React.FC<{ n: number; size?: 'sm' | 'md' }> = ({ n, size = 'md' }) => (
  <span
    aria-hidden
    className={`grid shrink-0 place-items-center rounded-full bg-[var(--tm-solid)] font-bold text-[var(--tm-solid-ink)] ${size === 'sm' ? 'h-5 w-5 text-[10.5px]' : 'h-6 w-6 text-[12px]'}`}
  >
    {n}
  </span>
);

const SECTION_IDS = ['report-attendance', 'report-login', 'report-tasks'];

/** Which numbered section is on screen (follows the scroll where the browser can tell). */
function useActiveSection(): [string, (id: string) => void] {
  const [active, setActive] = useState(SECTION_IDS[0]);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const first = SECTION_IDS.find((id) => seen.get(id));
        if (first) setActive(first);
      },
      { rootMargin: '-10% 0px -60% 0px' }
    );
    SECTION_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);
  return [active, setActive];
}

const InThisReport: React.FC<{ sheet: Sheet; onReveal: (id: string) => void }> = ({ sheet, onReveal }) => {
  const [active, setActive] = useActiveSection();
  const go = (id: string) => {
    setActive(id);
    onReveal(id);
  };
  const main = [
    { id: 'report-attendance', label: 'Attendance summary' },
    { id: 'report-login', label: 'Daily login record' },
    { id: 'report-tasks', label: 'Task report' }
  ];
  const subs = [
    { id: 'report-done', label: 'Done', count: sheet.tasks.done.length, dot: 'var(--tm-success)' },
    { id: 'report-overdue', label: 'Overdue', count: sheet.tasks.overdue.length, dot: 'var(--tm-danger)' },
    { id: 'report-remaining', label: 'Remaining', count: sheet.tasks.remaining.length, dot: 'var(--tm-accent)' }
  ];
  return (
    <nav aria-label="In this report" className={SIDE_CARD}>
      <h3 className={SECTION_TITLE}>In this report</h3>
      <ul className="mt-2 space-y-0.5">
        {main.map((l, i) => (
          <li key={l.id}>
            <button
              type="button"
              onClick={() => go(l.id)}
              aria-current={active === l.id ? 'true' : undefined}
              className={`flex w-full items-center gap-2.5 rounded-full px-2 py-1.5 text-left text-[13px] font-semibold text-[var(--tm-ink)] transition-colors hover:bg-[var(--tm-bg-sunken)] ${active === l.id ? 'bg-[var(--tm-primary-soft)]' : ''}`}
            >
              <Badge n={i + 1} size="sm" />
              {l.label}
            </button>
            {l.id === 'report-tasks' && (
              <ul className="mb-1 ml-9 mt-0.5 space-y-0.5">
                {subs.map((sub) => (
                  <li key={sub.id}>
                    <button
                      type="button"
                      onClick={() => go(sub.id)}
                      className="flex w-full items-center gap-2 rounded-full px-3 py-1 text-left text-[12.5px] font-medium text-[var(--tm-ink-soft)] transition-colors hover:bg-[var(--tm-bg-sunken)]"
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: sub.dot }} />
                      {sub.label}
                      <span className="ml-auto tabular-nums text-[var(--tm-ink-muted)]">{sub.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
};

const AtAGlance: React.FC<{ report: MonthlyReport; sheet: Sheet; admin?: boolean }> = ({ report, sheet, admin }) => {
  const t = report.tasks;
  const late = report.rows.filter((r) => r.result === 'Late');
  const avgDelay = late.length ? Math.round((late.reduce((n, r) => n + r.late_days, 0) / late.length) * 10) / 10 : null;
  const items: [string, string][] = [
    ['Days worked', `${sheet.totals.worked} / ${Math.max(sheet.totals.worked, sheet.summary.working - sheet.summary.remaining)}`],
    ['Usual login', clock12(report.attendance.avg_login)],
    ['Tasks done', `${t.completed} / ${t.assigned}`],
    ['Overdue', String(sheet.tasks.overdue.length)],
    ['Time tracked', niceTime(report.time.total_seconds)]
  ];
  if (admin) items.push(['Avg delay', avgDelay === null ? '-' : `${avgDelay}d`], ['Changes', String(report.changes_requested)]);
  return (
    <section aria-label="At a glance" className={SIDE_CARD}>
      <h3 className={SECTION_TITLE}>At a glance</h3>
      <dl className="mt-2 divide-y divide-[var(--tm-border)]/60">
        {items.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between py-2 text-[13px]">
            <dt className="text-[var(--tm-ink-soft)]">{label}</dt>
            <dd className="font-bold tabular-nums text-[var(--tm-ink)]">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};

/** A report section as its own card: a light header bar (number, title, one-line subtitle, a summary chip) and the content below. */
const SectionCard: React.FC<{
  id: string;
  n: number;
  title: string;
  subtitle: string;
  chip?: React.ReactNode;
  /** Set to make the section fold: `open` is the state, `onToggle` flips it. */
  open?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
}> = ({ id, n, title, subtitle, chip, open, onToggle, children }) => (
  <section id={id} className="scroll-mt-4 overflow-hidden rounded-[26px] border border-[var(--tm-border)] bg-[var(--tm-card)]">
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 bg-[var(--tm-card-muted)] px-5 py-4 ${onToggle ? 'cursor-pointer' : ''}`} onClick={onToggle}>
      <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--tm-solid)] text-[13px] font-bold tabular-nums text-[var(--tm-solid-ink)]">
        {String(n).padStart(2, '0')}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-[16px] font-bold leading-tight text-[var(--tm-ink)]">{title}</h2>
        <p className="mt-0.5 text-[12.5px] text-[var(--tm-ink-muted)]">{subtitle}</p>
      </div>
      {chip && <span className="rounded-full bg-[var(--tm-card)] px-3 py-1.5 text-[12.5px] font-semibold tabular-nums text-[var(--tm-ink)] ring-1 ring-[var(--tm-border)]">{chip}</span>}
      {onToggle && (
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--tm-ink-soft)] transition-colors hover:bg-[var(--tm-bg-sunken)]"
        >
          <ChevronDown className={`h-5 w-5 transition-transform ${open ? '' : '-rotate-90'}`} />
        </button>
      )}
    </div>
    {open !== false && <div className="p-5">{children}</div>}
  </section>
);

const AttendanceSummary: React.FC<{ report: MonthlyReport; sheet: Sheet }> = ({ report, sheet }) => {
  const s = sheet.summary;
  const cells: [string, number][] = [
    ['Working days', s.working],
    ['Present', s.present],
    ['WFH', s.wfh],
    ['Half day', s.halfDay],
    ['Leave', s.leave],
    ['No status', s.noStatus],
    ['Remaining', s.remaining]
  ];
  return (
    <SectionCard id="report-attendance" n={1} title="Attendance summary" subtitle="How the month's working days were spent" chip={`${s.present} / ${s.working - s.remaining} present`}>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[var(--tm-border)] bg-[var(--tm-border)] sm:grid-cols-4 xl:grid-cols-7">
        {cells.map(([label, n]) => (
          <div key={label} className={`px-3 py-2.5 ${label === 'Working days' ? 'bg-[var(--tm-primary-soft)]' : 'bg-[var(--tm-card)]'}`}>
            <dt className="text-[11.5px] font-medium text-[var(--tm-ink-muted)]">{label}</dt>
            <dd
              className={`mt-1 text-[22px] font-bold leading-none tabular-nums ${
                label === 'Remaining' ? 'text-[var(--tm-ink-muted)]' : label === 'No status' && n > 0 ? 'text-[var(--tm-warning)]' : 'text-[var(--tm-ink)]'
              }`}
            >
              {n}
            </dd>
          </div>
        ))}
      </dl>
      {report.summary && <p className="mt-3 text-[13px] text-[var(--tm-ink-soft)]">{report.summary}</p>}
    </SectionCard>
  );
};

const LoginRecord: React.FC<{ report: MonthlyReport; sheet: Sheet }> = ({ report, sheet }) => {
  const usual = report.attendance.avg_login;
  const t = sheet.totals;
  const up = sheet.upcoming;
  return (
    <SectionCard id="report-login" n={2} title="Daily login record" subtitle="One line per day, set against the usual login" chip={usual ? `Usual login ${clock12(usual)}` : undefined}>
      <div className="overflow-x-auto rounded-2xl border border-[var(--tm-border)]/60" aria-label="Login by day">
        <table className="tm-stack w-full min-w-[520px]">
          <thead className="bg-[var(--tm-card-muted)]">
            <tr>
              {['Date', 'Day', 'Status', 'Login time', 'vs usual'].map((h) => (
                <th key={h} scope="col" className={TH}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.days.map((d) => (
              <LoginLine key={d.date} d={d} />
            ))}
            {up && (
              <tr className="border-t border-[var(--tm-border)]/60">
                <td colSpan={5} className="px-3 py-2.5 text-[12.5px] italic text-[var(--tm-ink-muted)]">
                  {rangeLabel(up.from, up.to)} · {plural(up.working, 'working day')} remaining
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="bg-[var(--tm-card-muted)]">
            <tr className="border-t border-[var(--tm-border)] text-[13px] font-bold text-[var(--tm-ink)]">
              <td className="px-3 py-2.5" colSpan={5}>
                Month to date · {t.present} present · {t.late} late
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </SectionCard>
  );
};

const LoginLine: React.FC<{ d: DayRow }> = ({ d }) => {
  const dash = <span className="text-[var(--tm-ink-muted)]">—</span>;
  return (
    <tr className={`border-t border-[var(--tm-border)]/60 first:border-0 ${d.off ? 'bg-[var(--tm-card-muted)]/60' : ''}`}>
      <td className={`${TD} whitespace-nowrap font-semibold text-[var(--tm-ink)]`}>{d.dateLabel}</td>
      <td className={TD}>{d.weekday}</td>
      <td className={`${TD} whitespace-nowrap`}>
        {d.status ? (
          <span className={`${PILL} ${DAY_PILL[d.status]}`}>{STATUS_WORD[d.status]}</span>
        ) : d.off ? (
          <span className="italic text-[var(--tm-ink-muted)]">{d.off}</span>
        ) : (
          <span className={`${PILL} ${DAY_PILL.none}`}>No status</span>
        )}
      </td>
      <td className={`${TD} whitespace-nowrap tabular-nums`}>{d.login ?? dash}</td>
      <td className={`${TD} whitespace-nowrap ${d.vs ? VS_CLASS[d.vs.tone] : ''}`}>{d.vs ? d.vs.text : dash}</td>
    </tr>
  );
};

const CountTile: React.FC<{ label: string; n: number; tone?: string }> = ({ label, n, tone }) => (
  <div className="rounded-2xl bg-[var(--tm-card-muted)] px-3 py-2.5">
    <dd className={`text-[22px] font-bold leading-none tabular-nums ${tone ?? 'text-[var(--tm-ink)]'}`}>{n}</dd>
    <dt className="mt-1 text-[11.5px] font-medium text-[var(--tm-ink-muted)]">{label}</dt>
  </div>
);

const TaskGroup: React.FC<{
  id: string;
  title: string;
  dot: string;
  rows: ReportTaskRow[];
  dateLabel: string;
  dateOf: (r: ReportTaskRow) => string | null;
  open: boolean;
  onToggle: () => void;
  onOpenTask?: (id: string) => void;
}> = ({ id, title, dot, rows, dateLabel, dateOf, open: shown, onToggle, onOpenTask }) => {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const flip = (key: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const chip = 'inline-flex items-center rounded-full bg-[var(--tm-primary-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--tm-ink)]';
  return (
    <div className="mt-5 first:mt-0">
      <div id={id} className="mb-3 flex scroll-mt-4 items-center">
        <h3 className="min-w-0 flex-1 text-[15px] font-bold text-[var(--tm-ink)]">
          <button type="button" aria-expanded={shown} onClick={onToggle} className="flex w-full items-center gap-2.5 rounded-lg py-1 text-left">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: dot }} />
            {title}
            <span className="text-[12.5px] font-semibold tabular-nums text-[var(--tm-ink-muted)]">{rows.length}</span>
            <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-[var(--tm-ink-muted)] transition-transform ${shown ? '' : '-rotate-90'}`} />
          </button>
        </h3>
      </div>
      {!shown ? null : rows.length === 0 ? (
        <p className="rounded-2xl bg-[var(--tm-card-muted)] px-4 py-3 text-[13px] text-[var(--tm-ink-muted)]">Nothing here.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--tm-border)]/60">
          <table className="tm-stack w-full min-w-[720px] table-fixed">
            <colgroup>
              <col style={{ width: '34%' }} />
              <col />
              <col style={{ width: 110 }} />
              <col style={{ width: 120 }} />
            </colgroup>
            <thead className="bg-[var(--tm-card-muted)]">
              <tr>
                {['Task', 'Description', dateLabel, 'Status'].map((h) => (
                  <th key={h} scope="col" className={TH}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const changes = `c:${r.task_id}`;
                const files = `f:${r.task_id}`;
                const date = dateOf(r);
                return (
                  <tr key={r.task_id} onClick={() => onOpenTask?.(r.task_id)} className={`border-t border-[var(--tm-border)]/60 first:border-0 ${onOpenTask ? 'cursor-pointer hover:bg-[var(--tm-bg-sunken)]' : ''}`}>
                    <td className={TD}>
                      <span className="block font-semibold text-[var(--tm-ink)]">{r.title}</span>
                      <span className="block truncate text-[11.5px]">
                        {r.project} › {r.subfolder}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {r.seconds > 0 && <span className="text-[11.5px] tabular-nums">{niceTime(r.seconds)} tracked</span>}
                        {r.changes > 0 && (
                          <button type="button" aria-label={plural(r.changes, 'change')} aria-expanded={open.has(changes)} onClick={() => flip(changes)} className={chip}>
                            {r.changes}
                          </button>
                        )}
                        {r.files.length > 0 && (
                          <button type="button" aria-label={plural(r.files.length, 'file')} aria-expanded={open.has(files)} onClick={() => flip(files)} className={chip}>
                            {r.files.length}
                          </button>
                        )}
                      </span>
                      {open.has(changes) && (
                        <span className="mt-1 block text-[11.5px]">
                          {plural(r.changes, 'change request')}
                          {r.last_change_resolved ? `, last resolved ${shortDate(r.last_change_resolved)}` : ''}
                        </span>
                      )}
                      {open.has(files) && (
                        <ul className="mt-1 space-y-0.5 text-[11.5px]" onClick={(e) => e.stopPropagation()}>
                          {r.files.map((f, i) => (
                            <li key={i} className="truncate">
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
                    </td>
                    <td className={TD}>{r.description ? clip(r.description, 100) : <span className="text-[var(--tm-ink-muted)]">—</span>}</td>
                    <td className={`${TD} whitespace-nowrap`}>{date ? shortDate(date) : '—'}</td>
                    <td className={`${TD} whitespace-nowrap`}>
                      <span className={`${PILL} ${RESULT_TONE[r.result]}`}>{statusText(r)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const TaskReport: React.FC<{
  report: MonthlyReport;
  sheet: Sheet;
  open: boolean;
  onToggle: () => void;
  groups: Record<GroupKey, boolean>;
  onToggleGroup: (g: GroupKey) => void;
  onOpenTask?: (id: string) => void;
}> = ({ report, sheet, open, onToggle, groups, onToggleGroup, onOpenTask }) => {
  const { done, overdue, remaining } = sheet.tasks;
  const chip = `${done.length} / ${report.rows.length} done`;
  const common = { n: 3, id: 'report-tasks', title: 'Task report', subtitle: 'What was finished, what is late and what is left' };
  if (report.rows.length === 0) {
    return (
      <SectionCard {...common} chip="No tasks">
        <p className="rounded-2xl bg-[var(--tm-card-muted)] px-4 py-3 text-[13px] text-[var(--tm-ink-muted)]">No tasks this month.</p>
      </SectionCard>
    );
  }
  return (
    <SectionCard {...common} chip={chip} open={open} onToggle={onToggle}>
      <dl className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CountTile label="Total" n={report.rows.length} />
        <CountTile label="Done" n={done.length} tone="text-[var(--tm-success)]" />
        <CountTile label="Overdue" n={overdue.length} tone={overdue.length ? 'text-[var(--tm-danger)]' : undefined} />
        <CountTile label="Remaining" n={remaining.length} />
      </dl>
      <TaskGroup id="report-done" title="Done" dot="var(--tm-success)" rows={done} dateLabel="Completed" dateOf={(r) => r.completed} open={groups.done} onToggle={() => onToggleGroup('done')} onOpenTask={onOpenTask} />
      <TaskGroup id="report-overdue" title="Overdue" dot="var(--tm-danger)" rows={overdue} dateLabel="Due" dateOf={(r) => r.due} open={groups.overdue} onToggle={() => onToggleGroup('overdue')} onOpenTask={onOpenTask} />
      <TaskGroup id="report-remaining" title="Remaining" dot="var(--tm-accent)" rows={remaining} dateLabel="Due" dateOf={(r) => r.due} open={groups.remaining} onToggle={() => onToggleGroup('remaining')} onOpenTask={onOpenTask} />
    </SectionCard>
  );
};

type GroupKey = 'done' | 'overdue' | 'remaining';
const GROUP_OF_ID: Record<string, GroupKey> = { 'report-done': 'done', 'report-overdue': 'overdue', 'report-remaining': 'remaining' };

/** One employee's month as a sheet: attendance summary, daily login record, then the task report. `controls` sit above the section links. */
export const ReportView: React.FC<{ report: MonthlyReport; onOpenTask?: (taskId: string) => void; admin?: boolean; controls?: React.ReactNode; backTo?: string }> = ({ report, onOpenTask, admin, controls, backTo }) => {
  const sheet = buildSheet(report);
  const p = report.person;
  // The task report folds, and so does each of its three groups (Done and Overdue start open). The PDF always has everything open.
  const [tasksOpen, setTasksOpen] = useState(true);
  const [groups, setGroups] = useState<Record<GroupKey, boolean>>({ done: true, overdue: true, remaining: false });
  const reveal = (id: string) => {
    if (id === 'report-tasks' || id in GROUP_OF_ID) setTasksOpen(true);
    if (id in GROUP_OF_ID) setGroups((g) => ({ ...g, [GROUP_OF_ID[id]]: true }));
    setTimeout(() => jump(id), 0);
  };
  const generated = `${longDate(report.generated_at)}${report.state === 'in_progress' ? ' · in progress' : ''}`;
  return (
    <Layout
      controls={controls}
      side={
        <>
          <InThisReport sheet={sheet} onReveal={reveal} />
          <AtAGlance report={report} sheet={sheet} admin={admin} />
        </>
      }
    >
      <article aria-label="Monthly report" className="space-y-7">
        <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b-2 border-[var(--tm-ink)] px-1 pb-5">
          <div className="flex items-center gap-4">
            {backTo && <BackButton fallback={backTo} />}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--tm-ink-muted)]">Monthly report</p>
              <h1 className="mt-1 text-[30px] font-bold leading-tight tracking-[-0.02em] text-[var(--tm-ink)]">{monthLabel(report.month)}</h1>
            </div>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
            {[
              ['Employee', p.name],
              ['Role', p.title || p.role.charAt(0).toUpperCase() + p.role.slice(1)],
              ['Period', periodLabel(report.month)],
              ['Generated', generated]
            ].map(([label, value]) => (
              <React.Fragment key={label}>
                <dt className="text-[var(--tm-ink-muted)]">{label}</dt>
                <dd className="font-semibold text-[var(--tm-ink)]">{value}</dd>
              </React.Fragment>
            ))}
          </dl>
        </header>

        <AttendanceSummary report={report} sheet={sheet} />
        <LoginRecord report={report} sheet={sheet} />
        <TaskReport report={report} sheet={sheet} open={tasksOpen} onToggle={() => setTasksOpen((o) => !o)} groups={groups} onToggleGroup={(g) => setGroups((x) => ({ ...x, [g]: !x[g] }))} onOpenTask={onOpenTask} />

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--tm-border)] px-1 pt-4 text-[12px] text-[var(--tm-ink-muted)]">
          <span>Task Manager · {p.company || 'No company'}</span>
          <span>
            {p.name} · {monthLabel(report.month)}
          </span>
        </footer>
      </article>
    </Layout>
  );
};
