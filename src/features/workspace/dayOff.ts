import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import type { Holiday, Workspace } from '../../services/http/adminApi';

export type DayOff = { kind: 'holiday'; name: string; holiday: Holiday } | { kind: 'weekoff'; name: 'Week off' };

/** Monday = 0 .. Sunday = 6, the way the API stores weekdays. */
export const weekdayIndex = (d: Date) => (d.getDay() + 6) % 7;

const lastDay = (h: Holiday) => h.end_date ?? h.date;

/** A holiday applies to everyone when it lists no company, otherwise to people of those companies. */
export const appliesTo = (h: Holiday, companyId: string | null | undefined) =>
  h.company_ids.length === 0 || (!!companyId && h.company_ids.includes(companyId));

/** Is this day a named holiday or a weekly off for someone of this company? Holidays win over weekly offs. */
export function dayOffOn(ws: Workspace | null, day: string, companyId: string | null | undefined): DayOff | null {
  if (!ws) return null;
  const h = ws.holidays.find((x) => x.date <= day && day <= lastDay(x) && appliesTo(x, companyId));
  if (h) return { kind: 'holiday', name: h.name, holiday: h };
  return ws.weekly_off.includes(weekdayIndex(parseISO(day))) ? { kind: 'weekoff', name: 'Week off' } : null;
}

export interface UpcomingHoliday {
  holiday: Holiday;
  /** Days until it starts; 0 when it is on now (today is inside the range). */
  daysLeft: number;
  ongoing: boolean;
}

/** The next named holidays (weekly offs are not holidays), soonest first, including one that is on today. */
export function upcomingHolidays(ws: Workspace | null, companyId: string | null | undefined, today: string, limit = 5): UpcomingHoliday[] {
  if (!ws) return [];
  const now = parseISO(today);
  return ws.holidays
    .filter((h) => lastDay(h) >= today && appliesTo(h, companyId))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit)
    .map((h) => ({ holiday: h, daysLeft: Math.max(0, differenceInCalendarDays(parseISO(h.date), now)), ongoing: h.date <= today }));
}

/** "12 Mar" or "12 Mar - 14 Mar". */
export function holidayDates(h: Holiday): string {
  const a = parseISO(h.date);
  return h.end_date ? `${format(a, 'd MMM')} - ${format(parseISO(h.end_date), 'd MMM')}` : format(a, 'd MMM');
}

export const ymdOf = (d: Date) => format(d, 'yyyy-MM-dd');
export const nextDay = (ymd: string) => ymdOf(addDays(parseISO(ymd), 1));
