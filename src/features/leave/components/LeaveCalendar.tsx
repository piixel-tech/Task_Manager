import React, { useMemo, useState } from 'react';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import type { LeaveRequest } from '../../../services/http/leaveApi';
import { effectiveEnd, iso, isTaken, marksByDay, nextSelection, TYPE_LABEL, STATUS_LABEL, type Selection } from '../leaveUtils';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Props {
  requests: LeaveRequest[];
  value: Selection;
  onChange: (next: Selection) => void;
}

const niceDay = (d: string | null) => (d ? format(parseISO(d), 'EEE d') : '—');

/** A step that ticks once the day is picked. */
const StepChip: React.FC<{ done: boolean; label: string; day: string | null; pending?: string }> = ({ done, label, day, pending }) => (
  <span
    className={`inline-flex h-8 items-center gap-2 rounded-full px-3 text-[12.5px] font-semibold ${
      done ? 'bg-[var(--tm-solid)] text-[var(--tm-solid-ink)]' : 'bg-[var(--tm-card-muted)] text-[var(--tm-ink-muted)]'
    }`}
  >
    <span className={`grid h-4 w-4 place-items-center rounded-full ${done ? 'bg-[var(--tm-solid-ink)] text-[var(--tm-solid)]' : 'border border-[var(--tm-border-strong)]'}`}>
      {done && <Check className="h-3 w-3" strokeWidth={3} />}
    </span>
    {label} · {done ? niceDay(day) : (pending ?? '—')}
  </span>
);

/** A month grid: click the first day, click the last day (or the same day again for one day), the range is highlighted. Days already asked for show as pending or approved. */
export const LeaveCalendar: React.FC<Props> = ({ requests, value, onChange }) => {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const today = iso(startOfDay(new Date()));
  const marks = useMemo(() => marksByDay(requests), [requests]);
  const end = effectiveEnd(value);

  const days = eachDayOfInterval({
    start: startOfWeek(month, { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
  });

  const navBtn =
    'grid h-10 w-10 place-items-center rounded-full border border-[var(--tm-border)] bg-[var(--tm-card)] text-[var(--tm-ink)] hover:bg-[var(--tm-bg-sunken)]';

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--tm-ink-muted)]">Pick your dates</p>
          <h3 className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-[var(--tm-ink)]" aria-live="polite">
            {format(month, 'MMMM yyyy')}
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMonth(startOfMonth(new Date()))}
            className="h-10 rounded-full border border-[var(--tm-border)] bg-[var(--tm-card)] px-4 text-[13px] font-semibold text-[var(--tm-ink)] hover:bg-[var(--tm-bg-sunken)]"
          >
            Today
          </button>
          <button type="button" aria-label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))} className={navBtn}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))} className={navBtn}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2" aria-live="polite">
        <StepChip done={!!value.start} label="First day" day={value.start} />
        <StepChip done={!!value.end} label="Last day" day={value.end} pending={value.start ? 'pick one, or tap it again' : undefined} />
        <span className="text-[12px] font-medium text-[var(--tm-ink-muted)]">For one day, click it twice.</span>
      </div>

      <div className="mt-5 grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAYS.map((d) => (
          <div key={d} className="pb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--tm-ink-muted)]">
            {d}
          </div>
        ))}
        {days.map((d, idx) => {
          const key = iso(d);
          const col = idx % 7;
          const weekend = col >= 5;
          const past = key < today;
          const dayMarks = marks.get(key);
          const taken = isTaken(dayMarks);
          const disabled = past || taken;
          const isStart = key === value.start;
          const isEnd = key === end;
          const inRange = !!value.start && !!end && key >= value.start && key <= end;
          const approved = dayMarks?.some((m) => m.status === 'approved');
          const mark = dayMarks?.length ? (approved ? 'approved' : 'pending') : null;
          const title = dayMarks?.length
            ? dayMarks.map((m) => `${TYPE_LABEL[m.type]} (${STATUS_LABEL[m.status].toLowerCase()})`).join(', ')
            : past
              ? 'This day has passed'
              : undefined;

          let tone = 'text-[var(--tm-ink)] hover:bg-[var(--tm-bg-sunken)]';
          if (weekend) tone = 'bg-[var(--tm-card-muted)] text-[var(--tm-ink)] hover:bg-[var(--tm-bg-sunken)]';
          if (!isSameMonth(d, month)) tone = 'text-[var(--tm-ink-muted)] hover:bg-[var(--tm-bg-sunken)]';
          if (mark === 'approved') tone = 'bg-[var(--tm-success-bg)] text-[var(--tm-success)]';
          if (mark === 'pending') tone = 'bg-[var(--tm-warning-bg)] text-[var(--tm-warning)]';
          if (inRange) tone = 'text-[var(--tm-primary-dark)]';
          if (isStart || isEnd) tone = 'bg-[var(--tm-solid)] text-[var(--tm-solid-ink)]';

          // The lavender band runs behind the circles; it starts/ends at the middle of the end circles and rounds off at week edges.
          const single = isStart && isEnd;
          const bandStyle: React.CSSProperties | undefined =
            inRange && !single && (isStart || isEnd)
              ? { backgroundImage: `linear-gradient(to ${isStart ? 'right' : 'left'}, transparent 50%, var(--tm-primary-soft) 50%)` }
              : undefined;
          const band = inRange && !single && !isStart && !isEnd ? 'bg-[var(--tm-primary-soft)]' : '';
          const edge = inRange && !single ? `${col === 0 && !isStart ? 'rounded-l-full' : ''} ${col === 6 && !isEnd ? 'rounded-r-full' : ''}` : '';

          return (
            <div key={key} style={bandStyle} className={`flex h-10 items-center justify-center sm:h-14 ${band} ${edge}`}>
              <button
                type="button"
                disabled={disabled}
                data-day={key}
                data-selected={inRange || undefined}
                data-mark={mark ?? undefined}
                aria-pressed={inRange}
                aria-label={`${format(d, 'd MMMM yyyy')}${title ? `, ${title}` : ''}`}
                title={title}
                onClick={() => onChange(nextSelection(value, key))}
                className={`relative grid h-10 w-10 place-items-center rounded-full text-[13px] font-semibold tabular-nums transition-colors sm:h-14 sm:w-14 sm:text-[15px]
                  ${tone} ${disabled ? 'cursor-not-allowed opacity-45' : ''} ${key === today && !isStart && !isEnd ? 'ring-2 ring-[var(--tm-primary)]' : ''}`}
              >
                {d.getDate()}
                {mark && !inRange && <span aria-hidden className="absolute bottom-1.5 h-1.5 w-1.5 rounded-full bg-current sm:bottom-2.5" />}
              </button>
            </div>
          );
        })}
      </div>

      <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-[var(--tm-ink-soft)]" aria-label="Legend">
        <li className="flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 rounded-full bg-[var(--tm-solid)]" /> Selected
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 rounded-full ring-2 ring-[var(--tm-primary)]" /> Today
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 rounded-full bg-[var(--tm-success-bg)] ring-1 ring-[var(--tm-success-ring)]" /> Approved
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 rounded-full bg-[var(--tm-warning-bg)] ring-1 ring-[var(--tm-warning-ring)]" /> Pending
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 rounded-full bg-[var(--tm-card-muted)] ring-1 ring-[var(--tm-border)]" /> Weekend
        </li>
      </ul>
    </div>
  );
};
