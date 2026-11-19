import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Pause, Play } from 'lucide-react';
import { BottomSheet } from '../../../components/ui/BottomSheet';
import { useAuthStore } from '../../../store/authStore';
import { useTimerStore } from '../../../store/useTimerStore';
import { formatClock } from '../../../utils/format';
import { useMyTimer } from './useMyTimer';

/** Phones only: my timer in the top bar as a chip (task and live time). Tap it for the pause / resume panel. */
export const PhoneTimerChip: React.FC = () => {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const { running, paused, task, seconds, busy } = useMyTimer();
  const [open, setOpen] = useState(false);
  const prefix = role === 'admin' ? '/admin' : '/app';
  const label = running ? `Timer running on ${task?.title}` : paused ? `Timer paused on ${task?.title}` : 'No timer running';

  return (
    <>
      <button
        type="button"
        data-tour="timer"
        aria-label={label}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="flex h-11 min-w-0 max-w-[44vw] items-center gap-2 rounded-full border border-[var(--tm-border)] bg-[var(--tm-card)] px-3 text-[12px] font-bold text-[var(--tm-ink)]"
      >
        {running ? (
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[var(--tm-success)]" />
        ) : paused ? (
          <Pause className="h-3.5 w-3.5 shrink-0" fill="currentColor" />
        ) : (
          <Play className="h-3.5 w-3.5 shrink-0" />
        )}
        {task && <span className="min-w-0 truncate">{task.title}</span>}
        {task && <span className="shrink-0 tabular-nums text-[var(--tm-ink-soft)]">{formatClock(seconds)}</span>}
      </button>

      <BottomSheet isOpen={open} onClose={() => setOpen(false)} title="Timer">
        {task ? (
          <>
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-[var(--tm-ink-muted)]">
              {running && <span className="h-2 w-2 rounded-full bg-[var(--tm-success)]" />}
              {running ? 'Now tracking' : 'Paused'}
            </p>
            <p className="mt-1.5 text-[15px] font-bold text-[var(--tm-ink)]">{task.title}</p>
            <p className="mt-1 text-[30px] font-extrabold leading-none tabular-nums text-[var(--tm-ink)]">{formatClock(seconds)}</p>
            <div className="mt-5 flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void (running ? useTimerStore.getState().pause() : useTimerStore.getState().resume())}
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--tm-solid)] px-4 text-[14px] font-bold text-[var(--tm-solid-ink)] disabled:opacity-60"
              >
                {running ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4" fill="currentColor" />}
                {running ? 'Pause' : 'Resume'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate(`${prefix}/tasks/${task.id}`);
                }}
                className="inline-flex h-12 items-center justify-center gap-1.5 rounded-full border border-[var(--tm-border-strong)] px-4 text-[14px] font-bold text-[var(--tm-ink)]"
              >
                Open task <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>
          </>
        ) : (
          <p className="py-2 text-[14px] text-[var(--tm-ink-muted)]">Press play on one of your tasks to start tracking time.</p>
        )}
      </BottomSheet>
    </>
  );
};
