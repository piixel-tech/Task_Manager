import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useMotionPrefs } from './useMotionPrefs';

export interface HoldToDeleteProps {
  /** Runs once the hold completes. */
  onConfirm: () => void;
  label?: string;
  /** How long the pill has to be held, in milliseconds. */
  holdMs?: number;
  /** The action is running: shows a spinner and ignores new holds. */
  isLoading?: boolean;
  disabled?: boolean;
  /** `sm` for rows in a list. */
  size?: 'md' | 'sm';
  className?: string;
}

const SHAKE_MS = 340;

/**
 * "Hold to Delete" pill: a trash icon and a label. While it is held (about 1.2 s) a soft red fill sweeps left to right;
 * letting go early slides the fill back and nothing happens. When the fill completes the pill gives a small shake, then
 * `onConfirm` runs. Holding Enter or Space works the same as holding the mouse or a finger.
 * Reduced motion: no shake (the action runs the moment the fill completes) and the fill snaps back instead of sliding.
 */
export const HoldToDelete: React.FC<HoldToDeleteProps> = ({
  onConfirm,
  label = 'Hold to Delete',
  holdMs = 1200,
  isLoading = false,
  disabled = false,
  size = 'md',
  className = ''
}) => {
  const { reduced } = useMotionPrefs();
  const [phase, setPhase] = useState<'idle' | 'holding' | 'shaking'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmRef = useRef(onConfirm);
  useEffect(() => {
    confirmRef.current = onConfirm;
  });
  const inactive = disabled || isLoading;

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);

  const start = useCallback(() => {
    if (inactive || timer.current) return;
    setPhase('holding');
    timer.current = setTimeout(() => {
      timer.current = null;
      if (reduced) {
        setPhase('idle');
        confirmRef.current();
        return;
      }
      setPhase('shaking');
      timer.current = setTimeout(() => {
        timer.current = null;
        setPhase('idle');
        confirmRef.current();
      }, SHAKE_MS);
    }, holdMs);
  }, [inactive, holdMs, reduced]);

  /** Letting go early. Does nothing once the fill has completed. */
  const release = useCallback(() => {
    setPhase((p) => {
      if (p !== 'holding') return p;
      clear();
      return 'idle';
    });
  }, []);

  const filled = phase !== 'idle';
  const sweep = phase === 'holding' ? `${holdMs}ms` : reduced ? '0ms' : '260ms';

  return (
    <button
      type="button"
      disabled={inactive}
      aria-label={label}
      aria-busy={isLoading || undefined}
      data-phase={phase}
      title="Press and hold"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        start();
      }}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onBlur={release}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault(); // no click: the hold is the only way through
        if (!e.repeat) start();
      }}
      onKeyUp={(e) => {
        if (e.key === 'Enter' || e.key === ' ') release();
      }}
      className={`relative inline-flex ${size === 'sm' ? 'h-9 px-4 text-xs' : 'h-11 px-6 text-sm'} touch-none select-none items-center justify-center gap-2 overflow-hidden rounded-full border
        border-[var(--tm-danger-ring)] bg-[var(--tm-danger-bg)] font-semibold text-[var(--tm-danger)]
        outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-danger)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--tm-card)]
        disabled:cursor-not-allowed disabled:opacity-60 ${phase === 'shaking' ? 'tm-shake' : ''} ${className}`}
    >
      <span
        aria-hidden
        className="absolute inset-0 origin-left bg-[color-mix(in_srgb,var(--tm-danger)_30%,transparent)] ease-linear"
        style={{
          transform: filled ? 'scaleX(1)' : 'scaleX(0)',
          transition: `transform ${sweep} ${phase === 'holding' ? 'linear' : 'var(--tm-ease)'}`
        }}
      />
      <span className="relative flex items-center gap-2">
        {isLoading ? (
          <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
        ) : (
          <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
        )}
        <span>{label}</span>
      </span>
    </button>
  );
};
