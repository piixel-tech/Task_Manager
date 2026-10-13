import React from 'react';
import { Check, MessageSquareWarning, Send, RefreshCw } from 'lucide-react';
import type { Task, TaskReviewAction, TaskReviewEvent } from '../../../types';
import { StatusChip } from '../../../components/ui/StatusChip';
import { UserName } from '../../../components/ui/UserName';
import { formatDate, formatTime } from '../../../utils/time';

/**
 * Review flow helpers shared by the employee task list, the task detail view
 * and the admin submissions feed.
 *
 * Status mapping (task.reviewStatus -> task.status):
 *   submitted          -> review
 *   changes_requested  -> in_progress
 *   approved           -> completed
 */

/** Green "Approved" / orange "Changes Requested" / blue "Submitted" pill. */
export const ReviewBadge: React.FC<{ task: Task; size?: 'sm' | 'md' }> = ({ task, size = 'sm' }) => {
  if (!task.reviewStatus) return null;
  return <StatusChip status={task.reviewStatus} size={size} dot />;
};

/** Highlighted box with the reviewer's "what needs to change" message. */
export const ChangeRequestBox: React.FC<{ task: Task; compact?: boolean }> = ({ task, compact = false }) => {
  const cr = task.changeRequest;
  if (!cr || task.reviewStatus !== 'changes_requested') return null;

  return (
    <div
      className={`rounded-xl border-l-4 border border-[var(--tm-warning-ring)] border-l-[var(--tm-warning)] bg-[var(--tm-warning-bg)] ${
        compact ? 'p-3' : 'p-4'
      } space-y-1.5`}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-[var(--tm-warning)]">
        <MessageSquareWarning className="h-3.5 w-3.5" />
        What needs to change
      </div>

      <p className={`font-semibold leading-relaxed text-[var(--tm-warning)] ${compact ? 'text-xs' : 'text-[13px]'}`}>
        “{cr.message}”
      </p>

      <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[10.5px] font-semibold text-[var(--tm-warning)] opacity-90">
        <span>Requested by</span>
        <UserName userId={cr.requestedByUserId} size="sm" showAvatar={false} showTitle={false} />
        <span>·</span>
        <span>
          {formatDate(cr.requestedAt)} at {formatTime(cr.requestedAt)}
        </span>
      </div>
    </div>
  );
};

const actionMeta: Record<TaskReviewAction, { label: string; icon: React.ReactNode; className: string }> = {
  submitted: {
    label: 'Submitted for review',
    icon: <Send className="h-3.5 w-3.5" />,
    className: 'bg-[var(--tm-info-bg)] text-[var(--tm-info)] ring-[var(--tm-info-ring)]'
  },
  changes_requested: {
    label: 'Changes requested',
    icon: <MessageSquareWarning className="h-3.5 w-3.5" />,
    className: 'bg-[var(--tm-warning-bg)] text-[var(--tm-warning)] ring-[var(--tm-warning-ring)]'
  },
  resubmitted: {
    label: 'Resubmitted',
    icon: <RefreshCw className="h-3.5 w-3.5" />,
    className: 'bg-[var(--tm-info-bg)] text-[var(--tm-info)] ring-[var(--tm-info-ring)]'
  },
  approved: {
    label: 'Approved',
    icon: <Check className="h-3.5 w-3.5" />,
    className: 'bg-[var(--tm-success-bg)] text-[var(--tm-success)] ring-[var(--tm-success-ring)]'
  }
};

/** Full review trail: submitted -> changes requested -> resubmitted -> approved. */
export const ReviewHistoryTimeline: React.FC<{ task: Task }> = ({ task }) => {
  const history = task.reviewHistory || [];

  if (history.length === 0) {
    return (
      <p className="p-6 text-center text-xs text-[var(--tm-ink-muted)]">
        This task has not been submitted for review yet.
      </p>
    );
  }

  return (
    <ol className="space-y-0">
      {history.map((event: TaskReviewEvent, idx: number) => {
        const meta = actionMeta[event.action];
        const isLast = idx === history.length - 1;

        return (
          <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
            {/* Connector line */}
            {!isLast && (
              <span className="absolute left-[13px] top-7 bottom-0 w-px bg-[var(--tm-border)]" aria-hidden />
            )}

            <span
              className={`z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full ring-1 ring-inset ${meta.className}`}
            >
              {meta.icon}
            </span>

            <div className="min-w-0 flex-1 space-y-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[13px] font-bold text-[var(--tm-ink)]">{meta.label}</span>
                <span className="text-[10.5px] font-semibold text-[var(--tm-ink-muted)]">
                  {formatDate(event.at)} at {formatTime(event.at)}
                </span>
              </div>

              {event.byUserId && (
                <UserName userId={event.byUserId} size="sm" showAvatar={false} showTitle={false} />
              )}

              {event.message && (
                <p className="rounded-lg border border-[var(--tm-warning-ring)] bg-[var(--tm-warning-bg)] p-2.5 text-xs font-medium leading-relaxed text-[var(--tm-warning)]">
                  “{event.message}”
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
};
