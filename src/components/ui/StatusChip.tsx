import React from 'react';

export type ChipTone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral' | 'primary';

const toneStyles: Record<ChipTone, string> = {
  ok: 'bg-[var(--tm-success-bg)] text-[var(--tm-success)] ring-[var(--tm-success-ring)]',
  warn: 'bg-[var(--tm-warning-bg)] text-[var(--tm-warning)] ring-[var(--tm-warning-ring)]',
  bad: 'bg-[var(--tm-danger-bg)] text-[var(--tm-danger)] ring-[var(--tm-danger-ring)]',
  info: 'bg-[var(--tm-info-bg)] text-[var(--tm-info)] ring-[var(--tm-info-ring)]',
  neutral:
    'bg-[var(--tm-neutral-bg)] text-[var(--tm-neutral)] ring-[var(--tm-neutral-ring)]',
  primary:
    'bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)] ring-[color-mix(in_srgb,var(--tm-primary)_18%,transparent)]'
};

/**
 * Every status the data model can produce, mapped once to a tone + label.
 * Green = done, amber = in flight, red = pending/overdue/blocked.
 */
const statusMap: Record<string, { tone: ChipTone; label: string }> = {
  // Tasks
  todo: { tone: 'bad', label: 'Pending' },
  in_progress: { tone: 'warn', label: 'In progress' },
  review: { tone: 'info', label: 'In review' },
  completed: { tone: 'ok', label: 'Completed' },

  // Projects
  planning: { tone: 'info', label: 'Planning' },
  active: { tone: 'warn', label: 'Active' },
  on_hold: { tone: 'bad', label: 'On hold' },

  // Submissions
  pending: { tone: 'bad', label: 'Pending' },
  approved: { tone: 'ok', label: 'Approved' },
  rejected: { tone: 'bad', label: 'Rejected' },
  needs_changes: { tone: 'warn', label: 'Needs changes' },

  // Task review flow
  submitted: { tone: 'info', label: 'Submitted' },
  changes_requested: { tone: 'warn', label: 'Changes Requested' },

  // Assignment
  accepted: { tone: 'ok', label: 'Accepted' },

  // Attendance
  present: { tone: 'ok', label: 'Present' },
  absent: { tone: 'bad', label: 'Absent' },
  half_day: { tone: 'warn', label: 'Half day' },
  on_leave: { tone: 'info', label: 'On leave' },

  // Live board
  Working: { tone: 'ok', label: 'Working' },

  // Priorities
  low: { tone: 'neutral', label: 'Low' },
  medium: { tone: 'info', label: 'Medium' },
  high: { tone: 'warn', label: 'High' },
  urgent: { tone: 'bad', label: 'Urgent' },

  // Derived
  overdue: { tone: 'bad', label: 'Overdue' }
};

export interface StatusChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  status?: string;
  tone?: ChipTone;
  size?: 'sm' | 'md';
  dot?: boolean;
  icon?: React.ReactNode;
}

const prettify = (s: string) =>
  s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** Soft pastel pill for any status value. */
export const StatusChip: React.FC<StatusChipProps> = ({
  status,
  tone,
  size = 'md',
  dot = false,
  icon,
  children,
  className = '',
  ...props
}) => {
  const mapped = status ? statusMap[status] : undefined;
  const resolvedTone: ChipTone = tone ?? mapped?.tone ?? 'neutral';
  const label = children ?? mapped?.label ?? (status ? prettify(status) : '');

  const sizes =
    size === 'sm'
      ? 'text-[11px] px-2.5 py-1 gap-1.5'
      : 'text-xs px-3 py-1.5 gap-1.5';

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold leading-none
        ring-1 ring-inset ${sizes} ${toneStyles[resolvedTone]} ${className}`}
      {...props}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />}
      {icon}
      {label}
    </span>
  );
};
