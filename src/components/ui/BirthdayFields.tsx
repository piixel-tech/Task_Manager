import React, { useEffect, useState } from 'react';
import { Input } from './Input';
import { Select } from './Select';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** Days in each month; February has 29 because a birthday can be on 29 February. */
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const pad = (n: number | string) => String(n).padStart(2, '0');

/** "MM-DD" (or "") -> the month and day it holds. */
const split = (v: string): { month: string; day: string } => {
  const m = /^(\d{2})-(\d{2})$/.exec(v);
  return m ? { month: m[1], day: m[2] } : { month: '', day: '' };
};

/** The saved value for a day and month: "MM-DD" only when both are chosen and the day exists in that month. */
const combine = (month: string, day: string): string =>
  month && day && Number(day) <= DAYS_IN[Number(month) - 1] ? `${month}-${day}` : '';

interface Props {
  /** "MM-DD", or "" when not set. */
  value: string;
  year: string;
  onChange: (value: string, year: string) => void;
}

/**
 * Birthday: a day (1-31) and a month (January-December) with the days following the month, plus an optional year that is kept
 * private and never shown to anyone. Used in Settings and in the team list.
 *
 * The day and month are held here, so one can be chosen before the other. The parent only gets "MM-DD" once both are set.
 */
export const BirthdayFields: React.FC<Props> = ({ value, year, onChange }) => {
  const [{ month, day }, setParts] = useState(() => split(value));

  // Follow the saved value when it changes from outside (after saving, or loaded from another tab), but not while a half-picked
  // day or month is waiting for its partner.
  useEffect(() => {
    setParts((p) => (combine(p.month, p.day) === value ? p : split(value)));
  }, [value]);

  const days = month ? DAYS_IN[Number(month) - 1] : 31;
  const pick = (m: string, d: string) => {
    const dayOk = d && Number(d) <= (m ? DAYS_IN[Number(m) - 1] : 31); // moving to a shorter month drops a day that does not exist there
    const next = { month: m, day: dayOk ? d : '' };
    setParts(next);
    const v = combine(next.month, next.day);
    onChange(v, v ? year : '');
  };

  return (
    <div className="grid grid-cols-[1fr_1.4fr_1fr] gap-3">
      <Select
        label="Birthday day"
        value={day}
        onChange={(e) => pick(month, e.target.value)}
        options={[{ value: '', label: 'Day' }, ...Array.from({ length: days }, (_, i) => ({ value: pad(i + 1), label: String(i + 1) }))]}
      />
      <Select
        label="Month"
        value={month}
        onChange={(e) => pick(e.target.value, day)}
        options={[{ value: '', label: 'Month' }, ...MONTHS.map((n, i) => ({ value: pad(i + 1), label: n }))]}
      />
      <Input
        label="Year (optional)"
        inputMode="numeric"
        maxLength={4}
        placeholder="Private"
        value={year}
        disabled={!value}
        onChange={(e) => onChange(value, e.target.value.replace(/\D/g, '').slice(0, 4))}
        title="Never shown to anyone"
      />
    </div>
  );
};
