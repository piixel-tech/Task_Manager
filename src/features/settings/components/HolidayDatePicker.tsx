import React, { useState } from 'react';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export interface DateSel {
  start: string;
  end: string;
}

const ymd = (d: Date) => format(d, 'yyyy-MM-dd');
const label = (s: DateSel) => (s.start === s.end ? format(parseISO(s.start), 'd MMM yyyy') : `${format(parseISO(s.start), 'd MMM')} - ${format(parseISO(s.end), 'd MMM yyyy')}`);

/** A month calendar for picking holiday days: several single dates, or continuous ranges (click the first day, then the last). */
export const HolidayDatePicker: React.FC<{ value: DateSel[]; onChange: (next: DateSel[]) => void }> = ({ value, onChange }) => {
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [mode, setMode] = useState<'single' | 'range'>('single');
  const [from, setFrom] = useState<string | null>(null); // first click of a range

  const days = eachDayOfInterval({ start: startOfWeek(month, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });
  const covered = (d: string) => value.some((s) => s.start <= d && d <= s.end);
  const isEdge = (d: string) => value.some((s) => s.start === d || s.end === d);

  const click = (d: string) => {
    if (mode === 'single') {
      onChange(covered(d) ? value.filter((s) => !(s.start <= d && d <= s.end)) : [...value, { start: d, end: d }].sort((a, b) => a.start.localeCompare(b.start)));
      return;
    }
    if (!from) return setFrom(d);
    const [start, end] = d < from ? [d, from] : [from, d];
    onChange([...value, { start, end }].sort((a, b) => a.start.localeCompare(b.start)));
    setFrom(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" className="inline-flex rounded-full bg-[var(--tm-bg-sunken)] p-1 text-[12px] font-bold">
          {(['single', 'range'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setFrom(null);
              }}
              className={`rounded-full px-3 py-1 ${mode === m ? 'bg-[var(--tm-solid)] text-[var(--tm-solid-ink)]' : 'text-[var(--tm-ink-soft)]'}`}
            >
              {m === 'single' ? 'Single dates' : 'Date range'}
            </button>
          ))}
        </div>
        <span className="text-[12px] text-[var(--tm-ink-muted)]">
          {mode === 'single' ? 'Click days to select or unselect them.' : from ? `Starts ${format(parseISO(from), 'd MMM')}: now click the last day.` : 'Click the first day, then the last day.'}
        </span>
      </div>

      <div className="w-full max-w-xs rounded-[var(--tm-radius-md)] border border-[var(--tm-border)] p-3">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))} className="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--tm-bg-sunken)]">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-[13px] font-bold text-[var(--tm-ink)]">{format(month, 'MMMM yyyy')}</span>
          <button type="button" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))} className="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--tm-bg-sunken)]">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 text-center text-[10.5px] font-bold uppercase text-[var(--tm-ink-muted)]">
          {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {days.map((day) => {
            const key = ymd(day);
            const on = covered(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                aria-label={format(day, 'EEEE d MMMM yyyy')}
                onClick={() => click(key)}
                className={`mx-auto grid h-8 w-8 place-items-center rounded-full text-[12.5px] font-semibold transition-colors ${
                  isEdge(key) || from === key
                    ? 'bg-[var(--tm-solid)] text-[var(--tm-solid-ink)]'
                    : on
                      ? 'bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]'
                      : 'text-[var(--tm-ink)] hover:bg-[var(--tm-bg-sunken)]'
                } ${isSameMonth(day, month) ? '' : 'opacity-40'}`}
              >
                {format(day, 'd')}
              </button>
            );
          })}
        </div>
      </div>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Selected dates">
          {value.map((s) => (
            <span key={s.start + s.end} className="inline-flex items-center gap-1 rounded-full bg-[var(--tm-primary-soft)] py-1 pl-3 pr-1.5 text-[12px] font-bold text-[var(--tm-primary-dark)]">
              {label(s)}
              <button type="button" aria-label={`Remove ${label(s)}`} onClick={() => onChange(value.filter((x) => x !== s))} className="grid h-5 w-5 place-items-center rounded-full hover:bg-[var(--tm-bg-sunken)]">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
