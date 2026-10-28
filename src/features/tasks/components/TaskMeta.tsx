import React from 'react';
import { isBefore, parseISO, startOfDay } from 'date-fns';
import type { ApiTask } from '../../../services/http/taskApi';

/** Past its due date and not yet submitted. */
export const isOverdue = (t: Pick<ApiTask, 'due_date' | 'status'>): boolean =>
  !!t.due_date &&
  ['todo', 'in_progress', 'changes_requested'].includes(t.status) &&
  isBefore(parseISO(t.due_date), startOfDay(new Date()));

export const progressTone = (t: Pick<ApiTask, 'progress' | 'status'>): 'primary' | 'ok' | 'warn' =>
  t.status === 'approved' ? 'ok' : t.status === 'changes_requested' ? 'warn' : 'primary';

/** Label for the task status, in the words used on screen. */
export const STATUS_LABEL: Record<ApiTask['status'], string> = {
  todo: 'To do',
  in_progress: 'In progress',
  submitted: 'Submitted',
  changes_requested: 'Changes requested',
  approved: 'Approved'
};

export const StatusDot: React.FC<{ running: boolean }> = ({ running }) =>
  running ? (
    <span className="relative flex h-2 w-2" title="Timer running">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--tm-success)] opacity-60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--tm-success)]" />
    </span>
  ) : null;
