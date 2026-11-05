import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Pause, Play, Timer } from 'lucide-react';
import { useAuthStore } from '../../../store/authStore';
import { useTimerStore } from '../../../store/useTimerStore';
import { formatClock } from '../../../utils/format';
import { useMyTimer } from './useMyTimer';

const R = 19;
const CIRC = 2 * Math.PI * R;

/** Where the panel / tooltip opens: to the right of the rail button, bottom-aligned with it. */
const placeOf = (el: HTMLElement | null) => {
  const r = el?.getBoundingClientRect();
  return r ? { left: r.right + 12, bottom: Math.max(16, window.innerHeight - r.bottom) } : { left: 100, bottom: 16 };
};

/**
 * My timer at the bottom of the left rail. Idle: a small play icon. Running: a progress ring (the task's progress) with a
 * pulsing green dot; hovering names the task and its live time. Click: a small panel to pause / resume or open the task.
 */
export const RailTimer: React.FC = () => {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const { state, running, paused, task, seconds, busy } = useMyTimer();
  const btn = useRef<HTMLButtonElement>(null);
  const [hover, setHover] = useState(false);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, bottom: 0 });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (btn.current?.contains(t) || t.closest?.('[data-rail-timer]')) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const toggle = () => {
    setPos(placeOf(btn.current));
    setHover(false);
    setOpen((o) => !o);
  };
  const show = () => {
    setPos(placeOf(btn.current));
    setHover(true);
  };

  const pct = Math.min(100, Math.max(0, task?.progress ?? 0));
  const label = running ? `Timer running on ${task?.title}` : paused ? `Timer paused on ${task?.title}` : 'No timer running';
  const prefix = role === 'admin' ? '/admin' : '/app';

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
        onMouseEnter={show}
        onMouseLeave={() => setHover(false)}
        onFocus={show}
        onBlur={() => setHover(false)}
        data-state={state}
        className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-[20px] transition-colors duration-[var(--tm-dur-fast)] ${
          open || paused
            ? 'text-[var(--primary)]'
            : 'text-[var(--tm-ink-soft)] hover:bg-[color-mix(in_srgb,var(--tm-on-dark)_6%,transparent)] hover:text-[var(--tm-ink)]'
        }`}
      >
        {running ? (
          <>
            <svg viewBox="0 0 44 44" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
              <circle cx="22" cy="22" r={R} fill="none" stroke="var(--tm-border)" strokeWidth="3" />
              <circle
                cx="22"
                cy="22"
                r={R}
                fill="none"
                stroke="var(--tm-accent)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={CIRC * (1 - Math.max(pct, 3) / 100)}
                style={{ transition: 'stroke-dashoffset .6s ease' }}
              />
            </svg>
            <Timer className="relative h-5 w-5" strokeWidth={2} />
            <span className="absolute right-0 top-0 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--tm-success)] opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--tm-success)] ring-2 ring-[var(--tm-side-bg)]" />
            </span>
          </>
        ) : (
          <Play className="h-5 w-5" strokeWidth={2} fill={paused ? 'currentColor' : 'none'} />
        )}
      </button>

      {hover &&
        !open &&
        createPortal(
          <div
            role="tooltip"
            style={{ left: pos.left, bottom: pos.bottom }}
            className="glass-strong pointer-events-none fixed z-40 hidden max-w-[260px] rounded-[18px] px-3.5 py-2.5 lg:block"
          >
            {task ? (
              <>
                <p className="truncate text-[13px] font-bold text-[var(--tm-ink)]">{task.title}</p>
                <p className="mt-0.5 text-[12px] tabular-nums text-[var(--tm-ink-muted)]">
                  {running ? formatClock(seconds) : `Paused · ${formatClock(seconds)}`}
                </p>
              </>
            ) : (
              <p className="text-[13px] font-semibold text-[var(--tm-ink-soft)]">No timer running</p>
            )}
          </div>,
          document.body
        )}

      {open &&
        createPortal(
          <div
            data-rail-timer
            role="dialog"
            aria-label="Timer"
            style={{ left: pos.left, bottom: pos.bottom }}
            className="glass-strong fixed z-40 hidden w-[272px] rounded-[24px] p-4 lg:block"
          >
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-[var(--tm-ink-muted)]">
              {running && <span className="h-2 w-2 rounded-full bg-[var(--tm-success)]" />}
              {running ? 'Now tracking' : paused ? 'Paused' : 'Timer'}
            </p>
            {task ? (
              <>
                <p className="mt-1.5 line-clamp-2 text-[14px] font-bold text-[var(--tm-ink)]">{task.title}</p>
                <p className="mt-1 text-[26px] font-extrabold leading-none tabular-nums text-[var(--tm-ink)]">{formatClock(seconds)}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--tm-bg-sunken)]">
                  <div className="h-full rounded-full bg-[var(--tm-accent)]" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void (running ? useTimerStore.getState().pause() : useTimerStore.getState().resume())}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--tm-solid)] px-4 text-[13px] font-bold text-[var(--tm-solid-ink)] transition-opacity hover:opacity-90 disabled:opacity-60"
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
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-[var(--tm-border-strong)] px-4 text-[13px] font-bold text-[var(--tm-ink)] transition-colors hover:bg-[var(--tm-bg-sunken)]"
                  >
                    Open task <ArrowUpRight className="h-4 w-4" />
                  </button>
                </div>
              </>
            ) : (
              <p className="mt-2 text-[13px] text-[var(--tm-ink-muted)]">Press play on one of your tasks to start tracking time.</p>
            )}
          </div>,
          document.body
        )}
    </>
  );
};
