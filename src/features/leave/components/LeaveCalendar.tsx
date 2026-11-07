import React, { useMemo, useState } from 'react';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { LeaveRequest } from '../../../services/http/leaveApi';
import { effectiveEnd, iso, isTaken, marksByDay, nextSelection, TYPE_LABEL, STATUS_LABEL, type Selection } from '../leaveUtils';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Props {
  requests: LeaveRequest[];
  value: Selection;
  onChange: (next: Selection) => void;
}

/** A month grid: click the first day, click the last day, the range is highlighted. Days already asked for show as pending or approved. */
export const LeaveCalendar: React.FC<Props> = ({ requests, value, onChange }) => {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const today = iso(startOfDay(new Date()));
  const marks = useMemo(() => marksByDay(requests), [requests]);
  const end = effectiveEnd(value);

  const days = eachDayOfInterval({
    start: startOfWeek(month, { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
  });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-extrabold text-[var(--tm-ink)]" aria-live="polite">
          {format(month, 'MMMM yyyy')}
        </h3>
        <div className="flex gap-1.5">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setMonth((m) => addMonths(m, -1))}
            className="grid h-9 w-9 place-items-center rounded-full border border-[var(--tm-border)] bg-[var(--tm-card)] text-[var(--tm-ink)] hover:bg-[var(--tm-bg-sunken)]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setMonth((m) => addMonths(m, 1))}
            className="grid h-9 w-9 place-items-center rounded-full border border-[var(--tm-border)] bg-[var(--tm-card)] text-[var(--tm-ink)] hover:bg-[var(--tm-bg-sunken)]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((d) => (
          <div key={d} className="pb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--tm-ink-muted)]">
            {d}
          </div>
        ))}
        {days.map((d) => {
          const key = iso(d);
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
          if (!isSameMonth(d, month)) tone = 'text-[var(--tm-ink-muted)] hover:bg-[var(--tm-bg-sunken)]';
          if (mark === 'approved') tone = 'bg-[var(--tm-success-bg)] text-[var(--tm-success)]';
          if (mark === 'pending') tone = 'bg-[var(--tm-warning-bg)] text-[var(--tm-warning)]';
          if (inRange) tone = 'bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]';
          if (isStart || isEnd) tone = 'bg-[var(--tm-solid)] text-[var(--tm-solid-ink)]';

          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              data-day={key}
              data-selected={inRange || undefined}
              data-mark={mark ?? undefined}
              aria-pressed={inRange}
              aria-label={`${format(d, 'd MMMM yyyy')}${title ? `, ${title}` : ''}`}
              title={title}
              onClick={() => onChange(nextSelection(value, key))}
              className={`relative grid h-11 place-items-center rounded-[var(--tm-radius-md)] text-[13px] font-semibold tabular-nums transition-colors
                ${tone} ${disabled ? 'cursor-not-allowed opacity-45' : ''} ${key === today && !isStart && !isEnd ? 'ring-1 ring-[var(--tm-primary)]' : ''}`}
            >
              {d.getDate()}
              {mark && !inRange && dayMarks!.length === 1 && dayMarks![0].duration !== 'full' && (
                <span aria-hidden className="absolute bottom-1 h-1 w-1 rounded-full bg-current" />
              )}
            </button>
          );
        })}
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-[var(--tm-ink-soft)]" aria-label="Legend">
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[4px] bg-[var(--tm-solid)]" /> Selected
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[4px] bg-[var(--tm-success-bg)] ring-1 ring-[var(--tm-success-ring)]" /> Approved
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[4px] bg-[var(--tm-warning-bg)] ring-1 ring-[var(--tm-warning-ring)]" /> Pending
        </li>
      </ul>
    </div>
  );
};
