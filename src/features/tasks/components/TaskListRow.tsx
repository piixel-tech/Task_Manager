import { useState } from 'react';
import { BottomSheet } from '../../../components/ui/BottomSheet';
import { useLongPress } from '../../../hooks/useLongPress';
import { useTimerStore } from '../../../store/useTimerStore';
import React from 'react';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { Check, Hourglass } from 'lucide-react';
import type { ApiTask } from '../../../services/http/taskApi';
import { heatAttrs, type Heat } from '../../../utils/deadlineHeat';
import { isOverdue } from './TaskMeta';
import { PRIORITY_LOOK } from './TaskDetailPanel';
import { TaskLiveTime, TaskTimerButton } from './TaskTimer';

const OPEN = ['todo', 'in_progress', 'changes_requested'];

/** "2d late", "Today", "Thu 19" (this week), "28 Nov"; open tasks only get the relative forms. */
export function dueText(task: Pick<ApiTask, 'due_date' | 'status'>, now: Date = new Date()): string {
  if (!task.due_date) return 'No date';
  const due = parseISO(task.due_date);
  if (!OPEN.includes(task.status)) return format(due, 'd MMM');
  const diff = differenceInCalendarDays(due, now);
  if (diff < 0) return `${-diff}d late`;
  if (diff === 0) return 'Today';
  return diff < 7 ? format(due, 'EEE d') : format(due, 'd MMM');
}

/** One task in the grouped list: priority flag, title, Project › Subfolder, due date, and an action (play / hourglass / tick). */
export const TaskListRow: React.FC<{
  task: ApiTask;
  selected: boolean;
  heat: Heat | null;
  onSelect: () => void;
  /** Sent back for changes: who asked and what they wrote (null while it loads or if no comment was left). */
  feedback?: { reviewer: string | null; comments: string | null } | null;
  /** "Fix & resubmit" on a sent-back task. */
  onFix?: () => void;
}> = ({ task, selected, heat, onSelect, feedback, onFix }) => {
  const h = selected ? {} : heatAttrs(heat);
  const [sheet, setSheet] = useState(false);
  const press = useLongPress(() => setSheet(true));
  const late = isOverdue(task);
  const prio = PRIORITY_LOOK[task.priority];
  const canPlay = task.can_work && task.status !== 'submitted' && task.status !== 'approved';
  if (task.status === 'changes_requested') {
    return (
      <div
        className={`flex items-start gap-3 rounded-2xl p-3 transition-colors ${
          selected ? 'bg-[var(--tp-row-sel)] text-[var(--tp-row-sel-ink)]' : 'bg-[var(--tm-danger-bg)] text-[var(--tm-ink)]'
        }`}
      >
        <button type="button" onClick={onSelect} aria-current={selected} className="flex min-w-0 flex-1 items-start gap-3 text-left">
          <span title={`${prio.label} priority`} className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg ${prio.tone}`}>
            <prio.Icon aria-label={`${task.priority} priority`} className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold">{task.title}</span>
            <span className={`mt-0.5 block truncate text-[12px] ${selected ? 'opacity-70' : 'text-[var(--tm-ink-muted)]'}`}>
              {task.project_name} › {task.subfolder_name} · round {Math.max(1, task.review_rounds)}
            </span>
            {feedback && (feedback.reviewer || feedback.comments) && (
              <span className="mt-1.5 block line-clamp-2 text-[12.5px] leading-snug">
                {feedback.reviewer && <strong className="font-semibold">{feedback.reviewer}: </strong>}
                {feedback.comments ?? 'No comments were left.'}
              </span>
            )}
          </span>
        </button>
        <button
          type="button"
          onClick={onFix}
          className="inline-flex h-9 shrink-0 items-center rounded-full bg-[var(--tm-solid)] px-4 text-[12.5px] font-semibold text-[var(--tm-solid-ink)] transition hover:brightness-110"
        >
          Fix &amp; resubmit
        </button>
      </div>
    );
  }
  return (
    <div className="relative" {...press}>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected}
        data-heat={h['data-heat']}
        style={h.style}
        className={`${h.className ?? ''} flex w-full items-center gap-3 rounded-2xl py-2.5 pl-3 pr-14 text-left transition-colors ${
          task.timer_running ? 'shadow-[inset_3px_0_0_var(--tm-success)]' : ''
        } ${selected ? 'bg-[var(--tp-row-sel)] text-[var(--tp-row-sel-ink)]' : 'text-[var(--tm-ink)] hover:bg-[var(--tp-row-hover)]'}`}
      >
        <span title={`${prio.label} priority`} className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg ${prio.tone}`}>
          <prio.Icon aria-label={`${task.priority} priority`} className="h-3.5 w-3.5" strokeWidth={3} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">{task.title}</span>
          <span className={`mt-0.5 block truncate text-[12px] ${selected ? 'opacity-70' : 'text-[var(--tp-muted)]'}`}>
            {task.project_name} › {task.subfolder_name}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <TaskLiveTime task={task} />
          <span
            className={`text-[12px] font-semibold tabular-nums ${
              late ? (selected ? 'text-[var(--tp-red-on-sel)]' : 'text-[var(--tp-red)]') : selected ? '' : 'text-[var(--tp-muted)]'
            }`}
          >
            {dueText(task)}
          </span>
        </span>
      </button>
      <span className="absolute right-3 top-1/2 -translate-y-1/2">
        {canPlay ? (
          <TaskTimerButton task={task} size="sm" />
        ) : task.status === 'submitted' ? (
          <span title="Waiting for review" className="grid h-8 w-8 place-items-center rounded-full bg-[var(--tp-chip)] text-[var(--tp-chip-ink)]">
            <Hourglass className="h-4 w-4" />
          </span>
        ) : task.status === 'approved' ? (
          <span title="Approved" className="grid h-8 w-8 place-items-center rounded-full bg-[var(--tm-success-bg)] text-[var(--tm-success)]">
            <Check className="h-4 w-4" />
          </span>
        ) : null}
      </span>
      <BottomSheet isOpen={sheet} onClose={() => setSheet(false)} title={task.title}>
        <div className="space-y-1">
          <SheetAction label="Open task" onClick={() => { setSheet(false); onSelect(); }} />
          {canPlay && (
            <SheetAction
              label={task.timer_running ? 'Pause timer' : 'Start timer'}
              onClick={() => {
                setSheet(false);
                void (task.timer_running ? useTimerStore.getState().pause() : useTimerStore.getState().play(task));
              }}
            />
          )}
          {onFix && <SheetAction label="Fix and resubmit" onClick={() => { setSheet(false); onFix(); }} />}
        </div>
      </BottomSheet>
    </div>
  );
};

const SheetAction: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button type="button" onClick={onClick} className="flex min-h-[48px] w-full items-center rounded-[var(--tm-radius-md)] px-4 text-left text-[15px] font-semibold text-[var(--tm-ink)] hover:bg-[var(--tm-bg-sunken)]">
    {label}
  </button>
);
