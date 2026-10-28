import type { ChipTone } from '../../components/ui/StatusChip';

export type DayStatus = 'present' | 'wfh' | 'half_day' | 'leave';

export const DAY_STATUSES: {
  value: DayStatus;
  label: string;
  hint: string;
  tone: ChipTone;
  /** CSS colour for dots and calendar accents. */
  color: string;
}[] = [
  { value: 'present', label: 'Present', hint: 'Working from the office', tone: 'ok', color: 'var(--tm-success)' },
  { value: 'wfh', label: 'Work from home', hint: 'Working remotely today', tone: 'info', color: 'var(--tm-info)' },
  { value: 'half_day', label: 'Half day', hint: 'Available for part of the day', tone: 'warn', color: 'var(--tm-warning)' },
  { value: 'leave', label: 'On leave', hint: 'Not working today', tone: 'bad', color: 'var(--tm-danger)' }
];

export const statusMeta = (status: DayStatus | null | undefined) =>
  DAY_STATUSES.find((s) => s.value === status);
