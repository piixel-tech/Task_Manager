import React, { useMemo, useState } from 'react';
import { format, isBefore, isSameDay, isSameMonth, startOfDay } from 'date-fns';
import { ChevronLeft, ChevronRight, PartyPopper } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { PillTabs } from '../../../components/ui/PillTabs';
import type { StatusEntry } from '../../../services/http/calendarApi';
import type { DayStatus } from '../../status/statusMeta';
import type { DayOff } from '../../workspace/dayOff';
import { KIND_META, LEGEND_KINDS, PERSON_KINDS, type DayKind } from '../dayStatusMeta';

export interface BoardPerson {
  name: string;
  avatar_url: string | null;
}

interface Props {
  month: Date;
  days: Date[];
  selected: Date;
  onSelect: (day: Date) => void;
  onMonth: (delta: number) => void;
  /** The person whose calendar this is: their own statuses by date. */
  hostName: string;
  hostStatuses: Map<string, DayStatus>;
  /** Everyone's statuses in the shown range (for the team view and the day popover). */
  team: StatusEntry[];
  people: Map<string, BoardPerson>;
  dayOff: (day: Date) => DayOff | null;
  loading?: boolean;
}

const ymd = (d: Date) => format(d, 'yyyy-MM-dd');
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** A small status pill: icon + label, in the status's fixed colours. */
const Pill: React.FC<{ kind: DayKind; label?: string; compact?: boolean }> = ({ kind, label, compact }) => {
  const m = KIND_META[kind];
  const Icon = m.icon;
  const text = label ?? m.label;
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-bold leading-none"
      style={{ background: m.tint, color: m.color }}
      title={text}
    >
      <Icon className="h-3 w-3 shrink-0" strokeWidth={2} />
      <span className={`truncate ${compact ? 'hidden sm:inline' : ''}`}>{text}</span>
    </span>
  );
};

/**
 * A month of days with the status of each made obvious: a legend that filters, personal status pills, holiday tints
 * with the holiday's name, and (team view) stacked avatars with a count per status. Hover or focus a day for who is
 * in the office, working from home, on a half day or on leave.
 */
export const MonthStatusBoard: React.FC<Props> = ({ month, days, selected, onSelect, onMonth, hostName, hostStatuses, team, people, dayOff, loading }) => {
  const [view, setView] = useState<'person' | 'team'>('person');
  const [filter, setFilter] = useState<Set<DayKind>>(new Set());
  const [hover, setHover] = useState<string | null>(null);
  const today = startOfDay(new Date());

  const toggle = (k: DayKind) =>
    setFilter((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  /** date -> status -> user ids */
  const byDay = useMemo(() => {
    const m = new Map<string, Record<DayStatus, string[]>>();
    for (const e of team) {
      const day = m.get(e.date) ?? { present: [], wfh: [], half_day: [], leave: [] };
      day[e.status].push(e.user_id);
      m.set(e.date, day);
    }
    return m;
  }, [team]);

  /** Which of the legend kinds this day has, for the filter. */
  const kindsOf = (key: string, off: DayOff | null): Set<DayKind> => {
    const kinds = new Set<DayKind>();
    if (off?.kind === 'holiday') kinds.add('holiday');
    if (off?.kind === 'weekoff') kinds.add('weekend');
    if (view === 'person') {
      const s = hostStatuses.get(key);
      if (s) kinds.add(s);
    } else {
      const d = byDay.get(key);
      if (d) PERSON_KINDS.forEach((k) => d[k].length > 0 && kinds.add(k));
    }
    return kinds;
  };

  const filtering = filter.size > 0;

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-[18px] font-extrabold text-[var(--tm-ink)]">{format(month, 'MMMM yyyy')}</h3>
          <div className="flex items-center gap-1.5">
            <Button variant="solid" size="sm" onClick={() => onMonth(-1)} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="solid" size="sm" onClick={() => onMonth(1)} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <PillTabs
          size="sm"
          activeTab={view}
          onChange={(v) => setView(v as 'person' | 'team')}
          tabs={[
            { id: 'person', label: hostName },
            { id: 'team', label: 'Team' }
          ]}
        />
      </div>

      {/* Legend: every status, clickable to filter the calendar */}
      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
        {LEGEND_KINDS.map((k) => {
          const m = KIND_META[k];
          const Icon = m.icon;
          const on = filter.has(k);
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(k)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-bold transition-colors ${
                on ? 'border-transparent' : 'border-[var(--tm-border)] bg-[var(--tm-card)] text-[var(--tm-ink-soft)] hover:border-[var(--tm-border-strong)]'
              }`}
              style={on ? { background: m.tint, color: m.color, boxShadow: `inset 0 0 0 1.5px ${m.color}` } : undefined}
            >
              <Icon className="h-3.5 w-3.5" style={{ color: m.color }} strokeWidth={2} />
              {m.label}
            </button>
          );
        })}
        {filtering && (
          <button type="button" onClick={() => setFilter(new Set())} className="rounded-full px-2.5 py-1 text-[12px] font-bold text-[var(--tm-primary-dark)] hover:underline">
            Clear
          </button>
        )}
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-center text-[10.5px] font-bold uppercase tracking-wider text-[var(--tm-ink-muted)]">
        {WEEKDAYS.map((d) => (
          <div key={d} className="pb-1">
            {d}
          </div>
        ))}
      </div>

      <div className={`grid grid-cols-7 gap-1.5 ${loading ? 'opacity-60' : ''}`}>
        {days.map((day, i) => {
          const key = ymd(day);
          const off = dayOff(day);
          const holiday = off?.kind === 'holiday' ? off : null;
          const weekend = off?.kind === 'weekoff';
          const isToday = isSameDay(day, today);
          const isPast = isBefore(day, today);
          const inMonth = isSameMonth(day, month);
          const mine = hostStatuses.get(key);
          const groups = byDay.get(key);
          const kinds = kindsOf(key, off);
          const match = !filtering || [...filter].some((k) => kinds.has(k));
          const isSelected = isSameDay(day, selected);
          const col = i % 7;
          const lastRows = i >= days.length - 14;
          const popOpen = hover === key;
          const total = groups ? PERSON_KINDS.reduce((n, k) => n + groups[k].length, 0) : 0;

          return (
            <div key={key} className="relative" onMouseEnter={() => setHover(key)} onMouseLeave={() => setHover((h) => (h === key ? null : h))}>
              <button
                type="button"
                onClick={() => onSelect(day)}
                onFocus={() => setHover(key)}
                onBlur={() => setHover((h) => (h === key ? null : h))}
                aria-pressed={isSelected}
                aria-label={`${format(day, 'EEEE d MMMM')}${holiday ? `, ${holiday.name}` : weekend ? ', weekly off' : ''}${
                  view === 'person' && mine ? `, ${KIND_META[mine].long}` : ''
                }`}
                className={`flex min-h-[84px] w-full flex-col gap-1 rounded-[var(--tm-radius-sm)] border p-1.5 text-left transition-[opacity,box-shadow,background-color] sm:min-h-[104px] sm:p-2 ${
                  view === 'team' ? 'sm:min-h-[128px]' : ''
                } ${match ? '' : 'opacity-30'} ${!inMonth ? 'opacity-45' : isPast && !isToday ? 'opacity-70' : ''} ${
                  isSelected ? 'shadow-soft-sm' : 'hover:shadow-soft-xs'
                }`}
                style={{
                  background: holiday
                    ? 'color-mix(in srgb, var(--st-holiday) 10%, var(--tm-card))'
                    : weekend
                      ? 'color-mix(in srgb, var(--st-weekend) 9%, var(--tm-card))'
                      : 'var(--tm-card)',
                  borderColor: isSelected ? 'var(--tm-primary-dark)' : holiday ? 'color-mix(in srgb, var(--st-holiday) 30%, var(--tm-border))' : 'var(--tm-border)',
                  outline: isToday ? '2px solid var(--tm-primary-dark)' : undefined,
                  outlineOffset: isToday ? '1px' : undefined
                }}
              >
                <span className="flex items-start justify-between gap-1">
                  <span className={`text-[13px] font-extrabold tabular-nums ${weekend ? 'text-[var(--tm-ink-muted)]' : 'text-[var(--tm-ink)]'}`}>{format(day, 'd')}</span>
                  {view === 'person' && mine && <Pill kind={mine} compact />}
                </span>

                {holiday && (
                  <span className="flex items-center gap-1 text-[10.5px] font-bold leading-tight" style={{ color: 'var(--st-holiday)' }} title={holiday.name}>
                    <PartyPopper className="h-3 w-3 shrink-0" strokeWidth={2} />
                    <span className="line-clamp-2 break-words">{holiday.name}</span>
                  </span>
                )}

                {view === 'team' && groups && (
                  <span className="mt-auto flex flex-col gap-1">
                    {PERSON_KINDS.filter((k) => groups[k].length > 0 && (!filtering || filter.has(k))).map((k) => {
                      const m = KIND_META[k];
                      const Icon = m.icon;
                      const ids = groups[k];
                      return (
                        <span key={k} className="flex items-center gap-1" title={`${m.long}: ${ids.map((id) => people.get(id)?.name ?? 'Someone').join(', ')}`}>
                          <Icon className="h-3 w-3 shrink-0" style={{ color: m.color }} strokeWidth={2} />
                          <span className="hidden text-[10.5px] font-bold sm:inline" style={{ color: m.color }}>
                            {m.label}
                          </span>
                          <span className="text-[10.5px] font-extrabold tabular-nums" style={{ color: m.color }}>
                            {ids.length}
                          </span>
                          <span className="ml-auto hidden items-center sm:flex">
                            {ids.slice(0, 3).map((id, n) => {
                              const p = people.get(id);
                              return (
                                <span key={id} className={n > 0 ? '-ml-1.5' : ''} style={{ boxShadow: '0 0 0 1.5px var(--tm-card)', borderRadius: 999 }}>
                                  <Avatar name={p?.name ?? '?'} src={p?.avatar_url ?? undefined} size="xs" className="!h-4 !w-4 !text-[7px]" />
                                </span>
                              );
                            })}
                          </span>
                        </span>
                      );
                    })}
                  </span>
                )}
              </button>

              {/* Hover / focus: who is where on this day */}
              {popOpen && (
                <div
                  role="tooltip"
                  className={`glass-strong pointer-events-none absolute z-30 w-60 rounded-[var(--tm-radius-md)] p-3 text-left ${
                    col >= 4 ? 'right-0' : col <= 1 ? 'left-0' : 'left-1/2 -translate-x-1/2'
                  } ${lastRows ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}`}
                >
                  <p className="text-[12px] font-extrabold text-[var(--tm-ink)]">{format(day, 'EEEE, d MMMM')}</p>
                  {holiday && (
                    <p className="mt-1 flex items-center gap-1.5 text-[12px] font-bold" style={{ color: 'var(--st-holiday)' }}>
                      <PartyPopper className="h-3.5 w-3.5 shrink-0" /> {holiday.name}
                    </p>
                  )}
                  {weekend && <p className="mt-1 text-[12px] font-medium text-[var(--tm-ink-muted)]">Weekly off</p>}
                  {total === 0 ? (
                    <p className="mt-1.5 text-[12px] text-[var(--tm-ink-muted)]">{holiday || weekend ? 'Nobody has set a status.' : 'No statuses set yet.'}</p>
                  ) : (
                    <div className="mt-2 space-y-1.5">
                      {PERSON_KINDS.filter((k) => groups![k].length > 0).map((k) => {
                        const m = KIND_META[k];
                        const Icon = m.icon;
                        return (
                          <div key={k} className="text-[12px] leading-snug">
                            <span className="inline-flex items-center gap-1 font-bold" style={{ color: m.color }}>
                              <Icon className="h-3.5 w-3.5" strokeWidth={2} /> {m.label} {groups![k].length}
                            </span>
                            <span className="block text-[var(--tm-ink-soft)]">{groups![k].map((id) => people.get(id)?.name ?? 'Someone').join(', ')}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
};
