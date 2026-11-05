import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent } from '../../../components/ui/Card';
import { FilterBar, FilterSearch } from '../../../components/ui/FilterBar';
import { PillTabs } from '../../../components/ui/PillTabs';
import { SkeletonRows } from '../../../components/ui/Skeleton';
import { StatusChip } from '../../../components/ui/StatusChip';
import { statusApi, type StatusEntry, type TodayRow } from '../../../services/http/calendarApi';
import { fetchCompanies } from '../../../services/http/mappers';
import { DAY_STATUSES, statusMeta, type DayStatus } from '../../status/statusMeta';

type Filter = DayStatus | 'unset' | 'all';

// Local dates as YYYY-MM-DD (no time zones involved: attendance is by calendar day).
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (s: string, n: number) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const longDate = (s: string) => parse(s).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

// Chip order from the spec: Present · WFH · On leave · Half day · Not set.
const ORDER: DayStatus[] = ['present', 'wfh', 'leave', 'half_day'];
const SHORT: Record<DayStatus, string> = { present: 'Present', wfh: 'WFH', leave: 'On leave', half_day: 'Half day' };
const NOT_SET_COLOR = 'var(--tm-border-strong)';

const MiniCalendar: React.FC<{ value: string; today: string; onPick: (day: string) => void }> = ({ value, today, onPick }) => {
  const [month, setMonth] = useState(() => parse(value));
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7; // weeks start on Monday
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const nextDisabled = iso(new Date(month.getFullYear(), month.getMonth() + 1, 1)) > today;
  return (
    <div className="glass-strong absolute left-0 top-[calc(100%+8px)] z-30 w-72 rounded-[var(--tm-radius-lg)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--tm-bg-sunken)]">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-[13px] font-extrabold text-[var(--tm-ink)]">{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>
        <button type="button" aria-label="Next month" disabled={nextDisabled} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--tm-bg-sunken)] disabled:opacity-30">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10.5px] font-bold uppercase text-[var(--tm-ink-muted)]">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((n, i) => {
          if (n === null) return <span key={i} />;
          const day = iso(new Date(month.getFullYear(), month.getMonth(), n));
          const future = day > today;
          return (
            <button
              key={i}
              type="button"
              disabled={future}
              onClick={() => onPick(day)}
              className={`h-8 rounded-full text-[12.5px] font-semibold tabular-nums transition-colors disabled:opacity-30 ${
                day === value ? 'bg-[var(--tm-primary)] text-[var(--tm-on-primary)]' : day === today ? 'text-[var(--tm-primary-dark)] ring-1 ring-[var(--tm-primary)]' : 'text-[var(--tm-ink)] hover:bg-[var(--tm-bg-sunken)]'
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/** Admin only, read-only: who was in, working from home, on leave or on a half day, for a day or a whole month. Uses the existing daily status data. */
export const TeamAttendance: React.FC = () => {
  const today = iso(new Date());
  const [view, setView] = useState<'day' | 'month'>('day');
  const [date, setDate] = useState(today);
  const [calOpen, setCalOpen] = useState(false);
  const calRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<TodayRow[] | null>(null);
  const [month, setMonth] = useState<StatusEntry[] | null>(null);
  const [companyNames, setCompanyNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState('all');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<{ userId: string; day: string } | null>(null);

  const monthKey = date.slice(0, 7);
  const monthStart = `${monthKey}-01`;
  const monthEnd = iso(new Date(parse(monthStart).getFullYear(), parse(monthStart).getMonth() + 1, 0));

  useEffect(() => {
    fetchCompanies()
      .then((cs) => setCompanyNames(Object.fromEntries(cs.map((c) => [c.id, c.name.toLowerCase()]))))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let live = true;
    setRows(null);
    statusApi
      .overview(date)
      .then((r) => live && (setRows(r), setError(null)))
      .catch((e) => live && setError(e instanceof Error ? e.message : 'Could not load attendance'));
    return () => {
      live = false;
    };
  }, [date]);

  useEffect(() => {
    if (view !== 'month') return;
    let live = true;
    setMonth(null);
    statusApi
      .team(monthStart, monthEnd)
      .then((m) => live && setMonth(m))
      .catch((e) => live && setError(e instanceof Error ? e.message : 'Could not load the month'));
    return () => {
      live = false;
    };
  }, [view, monthStart, monthEnd]);

  useEffect(() => {
    if (!calOpen) return;
    const away = (e: MouseEvent) => !calRef.current?.contains(e.target as Node) && setCalOpen(false);
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [calOpen]);

  const byCell = useMemo(() => {
    const m = new Map<string, DayStatus>();
    for (const e of month ?? []) m.set(`${e.user_id}|${e.date}`, e.status);
    return m;
  }, [month]);
  const days = useMemo(() => Array.from({ length: parse(monthEnd).getDate() }, (_, i) => `${monthKey}-${String(i + 1).padStart(2, '0')}`), [monthKey, monthEnd]);

  // Company and name filters apply everywhere; the status filter on the day view picks that day's status, and on the month view picks people who had it that month.
  const people = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((r) => (company === 'all' || (r.company_id && companyNames[r.company_id] === company)) && (!q || r.name.toLowerCase().includes(q)));
  }, [rows, company, companyNames, query]);

  const dayStatus = (r: TodayRow): DayStatus | null => r.status;
  const counts = {
    present: people.filter((r) => dayStatus(r) === 'present').length,
    wfh: people.filter((r) => dayStatus(r) === 'wfh').length,
    leave: people.filter((r) => dayStatus(r) === 'leave').length,
    half_day: people.filter((r) => dayStatus(r) === 'half_day').length,
    unset: people.filter((r) => dayStatus(r) === null).length
  };
  const shown = people.filter((r) => {
    if (filter === 'all') return true;
    if (view === 'day') return filter === 'unset' ? r.status === null : r.status === filter;
    const mine = days.map((d) => byCell.get(`${r.user_id}|${d}`));
    return filter === 'unset' ? mine.some((s) => !s) : mine.includes(filter);
  });

  const step = (n: number) => {
    const next = view === 'month' ? iso(new Date(parse(date).getFullYear(), parse(date).getMonth() + n, 1)) : addDays(date, n);
    if (next <= today || view === 'month') setDate(next > today ? today : next);
    setPicked(null);
  };
  const atPresent = view === 'month' ? monthKey >= today.slice(0, 7) : date >= today;
  const heading = view === 'month' ? parse(monthStart).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : date === today ? 'Today' : longDate(date);

  const chip = (label: string, value: Filter, count: number | null, tone: React.ComponentProps<typeof StatusChip>['tone']) => (
    <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(filter === value ? 'all' : value)} className={`rounded-full transition-shadow ${filter === value ? 'ring-2 ring-[var(--tm-primary)]' : ''}`}>
      <StatusChip tone={tone} size="sm" dot>
        {count !== null && <span className="tabular-nums">{count}</span>} {label}
      </StatusChip>
    </button>
  );

  const pickedPerson = picked && (rows ?? []).find((r) => r.user_id === picked.userId);
  const pickedStatus = picked ? byCell.get(`${picked.userId}|${picked.day}`) : undefined;

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button type="button" aria-label={view === 'month' ? 'Previous month' : 'Previous day'} onClick={() => step(-1)} className="grid h-9 w-9 place-items-center rounded-full border border-[var(--tm-border)] hover:bg-[var(--tm-bg-sunken)]">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div ref={calRef} className="relative">
                <button type="button" aria-expanded={calOpen} onClick={() => setCalOpen((o) => !o)} className="flex h-9 items-center gap-2 rounded-full border border-[var(--tm-border)] px-4 text-[13.5px] font-extrabold text-[var(--tm-ink)] hover:bg-[var(--tm-bg-sunken)]">
                  <CalendarDays className="h-4 w-4 text-[var(--tm-primary-dark)]" /> {heading}
                </button>
                {calOpen && (
                  <MiniCalendar
                    value={date}
                    today={today}
                    onPick={(d) => {
                      setDate(d);
                      setPicked(null);
                      setCalOpen(false);
                    }}
                  />
                )}
              </div>
              <button type="button" aria-label={view === 'month' ? 'Next month' : 'Next day'} disabled={atPresent} onClick={() => step(1)} className="grid h-9 w-9 place-items-center rounded-full border border-[var(--tm-border)] hover:bg-[var(--tm-bg-sunken)] disabled:opacity-30">
                <ChevronRight className="h-4 w-4" />
              </button>
              <Button size="sm" variant="outline" disabled={date === today} onClick={() => (setDate(today), setPicked(null))}>
                Today
              </Button>
            </div>
            <PillTabs size="sm" activeTab={view} onChange={(v) => (setView(v as 'day' | 'month'), setPicked(null))} tabs={[{ id: 'day', label: 'Day' }, { id: 'month', label: 'Month' }]} />
          </div>

          <div className="flex flex-wrap gap-2" aria-label="Attendance summary">
            {ORDER.map((s) => chip(SHORT[s], s, view === 'day' ? counts[s] : null, statusMeta(s)!.tone))}
            {chip('Not set', 'unset', view === 'day' ? counts.unset : null, 'neutral')}
          </div>
        </CardContent>
      </Card>

      <FilterBar activeCount={(company !== 'all' ? 1 : 0) + (filter !== 'all' ? 1 : 0) + (query.trim() ? 1 : 0)} onClear={() => (setCompany('all'), setFilter('all'), setQuery(''))}>
        <PillTabs
          activeTab={company}
          onChange={setCompany}
          tabs={[{ id: 'all', label: 'All companies' }, ...Object.values(companyNames).map((n) => ({ id: n, label: n.charAt(0).toUpperCase() + n.slice(1) }))]}
        />
        <FilterSearch value={query} onChange={setQuery} placeholder="Search by name" />
      </FilterBar>

      {error && <div className="tm-error px-4 py-3 text-xs font-semibold">{error}</div>}

      {rows === null || (view === 'month' && month === null) ? (
        error ? null : <SkeletonRows count={6} />
      ) : shown.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-[var(--tm-ink-muted)]">No one matches these filters.</p>
      ) : view === 'day' ? (
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((r) => {
            const meta = statusMeta(r.status);
            const co = r.company_id ? companyNames[r.company_id] : undefined;
            return (
              <li key={r.user_id} className="flex items-center justify-between gap-3 rounded-full bg-[var(--tm-card-muted)] py-2 pl-2 pr-3">
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar name={r.name} src={r.avatar_url ?? undefined} size="md" />
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate text-[13px] font-bold text-[var(--tm-ink)]">{r.name}</span>
                    {co && (
                      <Badge variant={co === 'unwork' ? 'unwork' : 'piixel'} size="sm" className="mt-1 capitalize">
                        {co}
                      </Badge>
                    )}
                  </span>
                </span>
                <StatusChip tone={meta?.tone ?? 'neutral'} size="sm">
                  {meta?.label ?? 'Not set'}
                </StatusChip>
              </li>
            );
          })}
        </ul>
      ) : (
        <Card>
          <CardContent className="space-y-4 px-0 py-3">
            <div className="overflow-x-auto px-3">
              <table className="border-separate border-spacing-0 text-[11px]">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 min-w-[10rem] bg-[var(--tm-card)] px-2 py-1.5 text-left text-[11px] font-extrabold uppercase tracking-wider text-[var(--tm-ink-muted)]">Member</th>
                    {days.map((d) => {
                      const weekend = [0, 6].includes(parse(d).getDay());
                      return (
                        <th key={d} className={`w-7 min-w-7 py-1.5 text-center font-bold tabular-nums ${d === today ? 'text-[var(--tm-primary-dark)]' : weekend ? 'text-[var(--tm-ink-muted)]' : 'text-[var(--tm-ink-soft)]'}`}>
                          {Number(d.slice(8))}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.user_id}>
                      <td className="sticky left-0 z-10 bg-[var(--tm-card)] px-2 py-1">
                        <span className="flex items-center gap-2">
                          <Avatar name={r.name} src={r.avatar_url ?? undefined} size="md" className="!h-6 !w-6 !text-[10px]" />
                          <span className="max-w-[8rem] truncate text-[12.5px] font-bold text-[var(--tm-ink)]">{r.name}</span>
                        </span>
                      </td>
                      {days.map((d) => {
                        const s = byCell.get(`${r.user_id}|${d}`);
                        const meta = statusMeta(s);
                        const selected = picked?.userId === r.user_id && picked.day === d;
                        return (
                          <td key={d} className="p-0 text-center">
                            <button
                              type="button"
                              aria-label={`${r.name}, ${longDate(d)}: ${meta?.label ?? 'Not set'}`}
                              disabled={d > today}
                              onClick={() => setPicked({ userId: r.user_id, day: d })}
                              className={`grid h-7 w-7 place-items-center rounded-full hover:bg-[var(--tm-bg-sunken)] disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent ${selected ? 'bg-[var(--tm-primary-soft)]' : ''}`}
                            >
                              <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta?.color ?? NOT_SET_COLOR, opacity: meta ? 1 : 0.45 }} />
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--tm-border)] px-4 pt-3 text-[12px] text-[var(--tm-ink-soft)]">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {DAY_STATUSES.map((s) => (
                  <span key={s.value} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} /> {s.label}
                  </span>
                ))}
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full opacity-45" style={{ background: NOT_SET_COLOR }} /> Not set
                </span>
              </div>
              <p role="status" className="font-semibold text-[var(--tm-ink)]">
                {picked && pickedPerson ? `${pickedPerson.name} · ${longDate(picked.day)}: ${statusMeta(pickedStatus)?.label ?? 'Not set'}` : 'Select a day to see the status.'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
