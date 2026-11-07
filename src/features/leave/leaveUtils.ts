import { eachDayOfInterval, format, parseISO } from 'date-fns';
import type { LeaveDuration, LeaveRequest, LeaveStatus, LeaveType } from '../../services/http/leaveApi';

export const TYPE_LABEL: Record<LeaveType, string> = { leave: 'Leave', wfh: 'Work from home' };
export const DURATION_LABEL: Record<LeaveDuration, string> = { full: 'Full day', first_half: 'First half', second_half: 'Second half' };
export const STATUS_LABEL: Record<LeaveStatus, string> = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };

export const iso = (d: Date): string => format(d, 'yyyy-MM-dd');

const nice = (day: string) => format(parseISO(day), 'd MMM');

/** "20 Nov", "20 Nov · First half" or "20 Nov – 22 Nov". */
export function datesText(r: Pick<LeaveRequest, 'start_date' | 'end_date' | 'duration'>): string {
  if (r.start_date === r.end_date) return nice(r.start_date) + (r.duration === 'full' ? '' : ` · ${DURATION_LABEL[r.duration]}`);
  return `${nice(r.start_date)} – ${nice(r.end_date)}`;
}

/** What is already asked for on one day (pending or approved only: rejected ones free the day). */
export interface DayMark {
  status: 'pending' | 'approved';
  type: LeaveType;
  duration: LeaveDuration;
}

export function marksByDay(requests: LeaveRequest[]): Map<string, DayMark[]> {
  const marks = new Map<string, DayMark[]>();
  for (const r of requests) {
    if (r.status === 'rejected') continue;
    for (const d of eachDayOfInterval({ start: parseISO(r.start_date), end: parseISO(r.end_date) })) {
      const key = iso(d);
      marks.set(key, [...(marks.get(key) ?? []), { status: r.status, type: r.type, duration: r.duration }]);
    }
  }
  return marks;
}

/** A day cannot be asked for again when a full day is taken, or both halves are. (One free half can still be asked for.) */
export function isTaken(marks: DayMark[] | undefined): boolean {
  if (!marks?.length) return false;
  if (marks.some((m) => m.duration === 'full')) return true;
  return marks.some((m) => m.duration === 'first_half') && marks.some((m) => m.duration === 'second_half');
}

export interface Selection {
  start: string | null;
  /** Empty while only the first day was clicked (then it counts as that one day). */
  end: string | null;
}

/** Click start, click end, click again to start over. A day before the start becomes the new start. */
export function nextSelection(sel: Selection, day: string): Selection {
  if (!sel.start || sel.end) return { start: day, end: null };
  if (day < sel.start) return { start: day, end: null };
  return { start: sel.start, end: day };
}

export const effectiveEnd = (sel: Selection): string | null => (sel.start ? (sel.end ?? sel.start) : null);

export function daysIn(sel: Selection): string[] {
  const end = effectiveEnd(sel);
  if (!sel.start || !end) return [];
  return eachDayOfInterval({ start: parseISO(sel.start), end: parseISO(end) }).map(iso);
}
