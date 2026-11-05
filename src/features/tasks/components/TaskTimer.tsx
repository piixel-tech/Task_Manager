import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import type { ApiTask } from '../../../services/http/taskApi';
import { useAuthStore } from '../../../store/authStore';
import { ensureTimerLoaded as ensureLoaded, useTimerStore } from '../../../store/useTimerStore';
import { formatDuration } from '../../../utils/format';
import { StatusDot } from './TaskMeta';

/** Fetch a list again whenever the person's timer changes (played, paused, switched, or changed in another tab). */
export function useReloadOnTimerChange(load: () => unknown) {
  const rev = useTimerStore((s) => s.rev);
  const seen = useRef(rev);
  useEffect(() => {
    if (rev === seen.current) return;
    seen.current = rev;
    void load();
  }, [rev, load]);
}

/**
 * What a task card needs to know about its timer. For your own tasks the timer store (the server's answer to your last
 * play / pause) decides, so every card agrees at once. For someone else's task (admins, heads) the task list says whether it
 * runs. Time is the server's total plus the seconds that passed since that answer arrived.
 */
export function useTaskTimer(task: ApiTask) {
  const meId = useAuthStore((s) => s.user?.id);
  const current = useTimerStore((s) => s.current);
  const receivedAt = useTimerStore((s) => s.receivedAt);
  const busy = useTimerStore((s) => s.busy);
  const mine = !!meId && task.assignee?.id === meId;

  useEffect(() => {
    if (mine) ensureLoaded();
  }, [mine]);

  const own = mine ? current : null; // the store's answer, for my own tasks only
  const here = own?.task?.id === task.id;
  const running = own ? own.state === 'running' && here : task.timer_running;
  const paused = !!own && own.state === 'paused' && here;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  // When the list answer arrived (for tasks the store does not cover).
  const listAnchor = useMemo(() => Date.now(), [task.id, task.total_seconds, task.timer_running]);

  let seconds = task.total_seconds;
  if (own?.task && here && (running || paused)) {
    seconds = own.task.total_seconds + (running ? Math.max(0, (now - receivedAt) / 1000) : 0);
  } else if (running) {
    seconds += Math.max(0, (now - listAnchor) / 1000);
  }

  const toggle = () => {
    const timer = useTimerStore.getState();
    if (running) return timer.pause();
    return paused ? timer.resume() : timer.play(task);
  };

  return { running, paused, seconds, busy, toggle };
}

/** Play / pause on a task card. Only the assignee of an open task sees it. Playing another task pauses this one. */
export const TaskTimerButton: React.FC<{ task: ApiTask; size?: 'sm' | 'md'; className?: string }> = ({ task, size = 'md', className = '' }) => {
  const { running, busy, toggle } = useTaskTimer(task);
  if (!task.can_work) return null;
  const label = running ? `Pause timer on ${task.title}` : `Start timer on ${task.title}`;
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={running}
      title={running ? 'Pause timer' : 'Start timer'}
      disabled={busy}
      // Cards are clickable rows: playing must not also open the task.
      onClick={(e) => {
        e.stopPropagation();
        void toggle();
      }}
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full shadow-soft-xs transition-[transform,background-color,box-shadow] duration-150 hover:scale-105 active:scale-95 disabled:opacity-60 ${
        size === 'sm' ? 'h-8 w-8' : 'h-9 w-9'
      } ${
        running
          ? 'bg-[var(--tm-success)] text-[var(--tm-on-primary)]'
          : 'bg-[var(--tm-ink)] text-[var(--tm-card)] hover:bg-[var(--tm-ink-soft)]'
      } ${className}`}
    >
      {running && <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-[var(--tm-success)] opacity-30" />}
      {running ? <Pause className="relative h-4 w-4" fill="currentColor" /> : <Play className="relative ml-0.5 h-4 w-4" fill="currentColor" />}
    </button>
  );
};

/** "● 12m 04s" while the timer runs on this task; nothing otherwise. */
export const TaskLiveTime: React.FC<{ task: ApiTask; className?: string }> = ({ task, className = '' }) => {
  const { running, seconds } = useTaskTimer(task);
  if (!running) return null;
  return (
    <span
      title="Time tracked on this task (timer running)"
      className={`inline-flex items-center gap-1.5 rounded-full bg-[var(--tm-success-bg)] px-2 py-0.5 text-[11px] font-bold tabular-nums text-[var(--tm-success)] ${className}`}
    >
      <StatusDot running />
      {formatDuration(seconds)}
    </span>
  );
};
