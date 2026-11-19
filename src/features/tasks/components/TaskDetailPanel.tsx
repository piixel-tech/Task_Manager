import React from 'react';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { AlertCircle, ArrowDown, ArrowRight, ArrowUp, ArrowUpRight, Check, Folder, Pause, Play, Send } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { PersonLink } from '../../../components/ui/PersonLink';
import type { ApiPriority, ApiTask, ApiTaskStatus } from '../../../services/http/taskApi';
import { formatDate } from '../../../utils/time';
import { formatDuration } from '../../../utils/format';
import { isOverdue, StatusDot } from './TaskMeta';

const CHIP = 'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold leading-none';
const CHIP_SOFT = `${CHIP} bg-[var(--tp-chip)] text-[var(--tp-chip-ink)]`;

const STATUS_LABEL: Record<ApiTaskStatus, string> = {
  todo: 'Pending',
  in_progress: 'In progress',
  submitted: 'Submitted',
  changes_requested: 'Changes requested',
  approved: 'Approved'
};

/** The priority's look, shared by the detail chip and the list's square. */
export const PRIORITY_LOOK: Record<ApiPriority, { label: string; Icon: typeof ArrowUp; tone: string }> = {
  urgent: { label: 'Urgent', Icon: ArrowUp, tone: 'bg-[var(--tm-danger-bg)] text-[var(--tm-danger)]' },
  high: { label: 'High', Icon: ArrowUp, tone: 'bg-[var(--tm-danger-bg)] text-[var(--tm-danger)]' },
  medium: { label: 'Medium', Icon: ArrowRight, tone: 'bg-[var(--tm-warning-bg)] text-[var(--tm-warning)]' },
  low: { label: 'Low', Icon: ArrowDown, tone: 'bg-[var(--tm-neutral-bg)] text-[var(--tm-neutral)]' }
};

/** Step of the review path the task is on: 1 In progress, 2 Submitted to head, 3 Approved. */
export const reviewStep = (status: ApiTaskStatus): 1 | 2 | 3 => (status === 'approved' ? 3 : status === 'submitted' ? 2 : 1);
const STEPS = ['In progress', 'Submitted to head', 'Approved'];

/** A ring with the percentage inside it (sized so the number always fits). */
const Ring: React.FC<{ value: number }> = ({ value }) => {
  const size = 84;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${pct}% done`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke="var(--tp-track)" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke="var(--tp-bar)"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[17px] font-bold tabular-nums leading-none text-[var(--tp-text)]">{pct}%</span>
    </div>
  );
};

const Cell: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="min-w-0 rounded-2xl border border-[var(--tp-card-border)] bg-[var(--tp-card)] p-3.5 text-[var(--tp-text)]">
    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--tp-muted)]">{title}</h3>
    {children}
  </section>
);

/** The right-hand panel of My Tasks: breadcrumb, chips, overdue banner, review path, timer card and the 2x2 facts. */
export const TaskDetailPanel: React.FC<{
  task: ApiTask;
  meId?: string;
  /** Shown in a box above the facts (the reviewer's comments on a task sent back). */
  requestedChanges?: string | null;
  busy: boolean;
  /** Seconds the running timer has added since the task was loaded. */
  tick: number;
  onToggleTimer: () => void;
  onSubmit: () => void;
  onOpen: () => void;
}> = ({ task, meId, requestedChanges, busy, tick, onToggleTimer, onSubmit, onOpen }) => {
  const late = isOverdue(task);
  const lateDays = late && task.due_date ? differenceInCalendarDays(new Date(), parseISO(task.due_date)) : 0;
  const prio = PRIORITY_LOOK[task.priority];
  const step = reviewStep(task.status);
  const byOther = !!meId && task.assignee?.id === meId && !!task.created_by && task.created_by.id !== meId;
  const total = task.total_seconds + (task.timer_running ? tick : 0);

  return (
    <article
      data-focus-keep
      className="relative rounded-[24px] bg-[var(--tp-detail)] p-5 text-[var(--tp-text)] sm:p-6"
      style={{ backgroundImage: 'radial-gradient(ellipse 80% 140px at 50% 0%, var(--tp-glow), transparent 70%)' }}
    >
      <div className="absolute right-5 top-5 z-10 sm:right-6 sm:top-6">
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--tm-primary-soft)] bg-[var(--tm-card)] px-4 text-[13px] font-semibold text-[var(--tm-ink)] shadow-sm transition-colors hover:bg-[var(--tm-primary-soft)]"
        >
          Open task <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>

      <header className="min-w-0 pr-36">
        <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--tp-muted)]">
          <Folder className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {task.project_name} › {task.subfolder_name}
          </span>
        </p>
        <h2 className="mt-1 text-[24px] font-semibold leading-[1.2] tracking-[-0.01em] text-[var(--tp-title)]">{task.title}</h2>
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          {task.unresolved_changes > 0 && (
            <span title={`${task.unresolved_changes} open mid-way ${task.unresolved_changes === 1 ? 'change' : 'changes'}`} className={CHIP_SOFT}>
              <AlertCircle className="h-3.5 w-3.5" />
              {task.unresolved_changes}
            </span>
          )}
          <span className={`${CHIP} ${prio.tone}`}>
            <prio.Icon className="h-3 w-3" strokeWidth={3} /> {prio.label}
          </span>
          <span className={CHIP_SOFT}>{STATUS_LABEL[task.status]}</span>
          {late && (
            <span className={`${CHIP} bg-[var(--tm-danger-bg)] text-[var(--tm-danger)]`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" /> Overdue
            </span>
          )}
          {byOther && <span className={CHIP_SOFT}>Assigned to me by {task.created_by!.name}</span>}
        </div>
      </header>

      {late && task.due_date && (
        <p role="alert" className="mt-4 rounded-2xl bg-[var(--tm-danger-bg)] px-4 py-3 text-[13px] font-semibold text-[var(--tm-danger)]">
          Overdue by {lateDays}d — was due {formatDate(task.due_date, 'EEE d MMM')}. Finish and submit for review.
        </p>
      )}

      <ol aria-label="Review path" className="mt-5 flex items-start">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const current = n === step;
          const done = n < step || (step === 3 && n === 3);
          return (
            <li key={label} aria-current={current && !done ? 'step' : undefined} className="relative flex flex-1 flex-col items-center text-center">
              {i > 0 && (
                <span
                  aria-hidden
                  className={`absolute right-1/2 top-[15px] h-0.5 w-full ${n <= step ? 'bg-[var(--tm-solid)]' : 'bg-[var(--tp-track)]'}`}
                />
              )}
              <span
                className={`relative z-10 grid h-8 w-8 place-items-center rounded-full text-[13px] font-bold ring-4 ring-[var(--tp-detail)] ${
                  done ? 'bg-[var(--tm-success)] text-white' : current ? 'bg-[var(--tm-solid)] text-[var(--tm-solid-ink)]' : 'border-2 border-[var(--tp-track)] bg-[var(--tp-detail)] text-[var(--tp-muted)]'
                }`}
              >
                {done ? <Check className="h-4 w-4" strokeWidth={3} /> : n}
              </span>
              <span className={`mt-1.5 px-1 text-[12px] leading-tight ${current || done ? 'font-semibold text-[var(--tp-text)]' : 'font-medium text-[var(--tp-muted)]'}`}>{label}</span>
              {current && !done && <span className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tp-muted)]">Now</span>}
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-[20px] bg-[var(--tm-solid)] p-4 text-[var(--tm-solid-ink)]">
        {task.can_work && (
          <button
            type="button"
            disabled={busy}
            onClick={onToggleTimer}
            aria-label={task.timer_running ? 'Stop timer' : 'Start timer'}
            className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[var(--tm-accent)] text-[var(--tm-accent-ink)] transition hover:brightness-95 disabled:opacity-60"
          >
            {task.timer_running ? <Pause className="h-6 w-6" fill="currentColor" /> : <Play className="ml-0.5 h-6 w-6" fill="currentColor" />}
          </button>
        )}
        <div className="min-w-0 flex-1 max-md:min-w-[calc(100%-5rem)]">
          <p className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] opacity-70">
            <StatusDot running={task.timer_running} />
            {task.timer_running ? 'Stop timer' : 'Start timer'} · Total tracked
          </p>
          <p className="mt-0.5 text-[30px] font-bold leading-tight tabular-nums">{formatDuration(total)}</p>
        </div>
        {task.can_work && (
          <button
            type="button"
            onClick={onSubmit}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--tm-card)] px-5 text-[13px] font-semibold text-[var(--tm-ink)] transition hover:brightness-95 max-md:w-full max-md:justify-center"
          >
            <Send className="h-4 w-4" /> Submit for review
          </button>
        )}
      </div>

      {requestedChanges !== undefined && requestedChanges !== null && (
        <section className="mt-3 rounded-2xl border border-[var(--tp-card-border)] bg-[var(--tp-card)] p-3.5">
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--tp-muted)]">Requested changes</h3>
          <p className="whitespace-pre-wrap text-[13px] font-medium">{requestedChanges}</p>
        </section>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Cell title="Progress">
          <div className="flex items-center gap-4">
            <Ring value={task.progress} />
            <span className="text-[13px] font-semibold text-[var(--tp-text-soft)]">Done so far</span>
          </div>
        </Cell>
        <Cell title="Assignee">
          <PersonLink userId={task.assignee?.id} className="flex items-center gap-2 text-[13px] font-semibold text-[var(--tp-text)]">
            {task.assignee && <Avatar name={task.assignee.name} src={task.assignee.avatar_url ?? undefined} size="sm" />}
            {task.assignee?.name ?? 'Unassigned'}
          </PersonLink>
        </Cell>
        <Cell title="Due date">
          <span className={`text-[13px] font-semibold ${late ? 'text-[var(--tp-red)]' : 'text-[var(--tp-text)]'}`}>
            {task.due_date ? formatDate(task.due_date, 'EEE d MMM') : 'No due date'}
          </span>
        </Cell>
        <Cell title="Priority">
          <span className={`${CHIP} ${prio.tone}`}>
            <prio.Icon className="h-3 w-3" strokeWidth={3} /> {prio.label}
          </span>
        </Cell>
      </div>
    </article>
  );
};
