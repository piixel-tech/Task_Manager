import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'motion/react';
import { ArrowRight, Check } from 'lucide-react';
import { useMotionPrefs } from './useMotionPrefs';
import { EASE_OUT, spring } from './motion';

export interface SlideToConfirmProps {
  label?: string;
  confirmedLabel?: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  /** Fraction of the track that must be covered to fire. */
  threshold?: number;
  tone?: 'primary' | 'danger';
  className?: string;
}

const KNOB = 48;

/**
 * A pill you drag to the far end to confirm. The track fills with the accent
 * colour as the knob travels; releasing short of the threshold springs back.
 * Keyboard users can confirm with Enter or Space.
 */
export const SlideToConfirm: React.FC<SlideToConfirmProps> = ({
  label = 'Slide to confirm',
  confirmedLabel = 'Confirmed',
  onConfirm,
  disabled = false,
  threshold = 0.82,
  tone = 'primary',
  className = ''
}) => {
  const { reduced } = useMotionPrefs();
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const x = useMotionValue(0);
  const maxX = Math.max(0, trackWidth - KNOB - 8);

  // Track fill follows the knob.
  const fillWidth = useTransform(x, (v) => `${v + KNOB + 4}px`);
  const labelOpacity = useTransform(x, [0, Math.max(maxX * 0.55, 1)], [1, 0]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => setTrackWidth(el.offsetWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setDone(false);
    setBusy(false);
    x.set(0);
  }, [label, tone, confirmedLabel, x]);

  const fire = useCallback(async () => {
    if (done || busy || disabled) return;
    setBusy(true);
    setDone(true);
    animate(x, maxX, reduced ? { duration: 0 } : { duration: 0.22, ease: EASE_OUT });
    try {
      await onConfirm();
    } finally {
      setBusy(false);
      setTimeout(() => {
        setDone(false);
        animate(x, 0, reduced ? { duration: 0 } : spring);
      }, 600);
    }
  }, [done, busy, disabled, x, maxX, onConfirm, reduced]);

  const reset = useCallback(() => {
    setDone(false);
    animate(x, 0, reduced ? { duration: 0 } : spring);
  }, [x, reduced]);

  const accent = tone === 'danger' ? 'var(--tm-danger)' : 'var(--tm-primary)';

  return (
    <div
      ref={trackRef}
      className={`relative h-14 w-full select-none overflow-hidden rounded-full
        ${done ? '' : 'hatch-neutral'}
        border border-[var(--tm-border)] ${disabled ? 'opacity-50' : ''} ${className}`}
    >
      {/* Fill */}
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: fillWidth, background: accent }}
      />

      {/* Resting label */}
      <motion.span
        style={{ opacity: done ? 0 : labelOpacity }}
        className="pointer-events-none absolute inset-0 flex items-center justify-center
          pl-12 text-[13px] font-bold uppercase tracking-[0.1em] text-[var(--tm-ink-muted)]"
      >
        {label}
      </motion.span>

      {/* Confirmed label */}
      {done && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduced ? 0 : 0.2, ease: EASE_OUT }}
          className="pointer-events-none absolute inset-0 flex items-center justify-center
            pr-12 text-[13px] font-bold uppercase tracking-[0.1em] text-white"
        >
          {confirmedLabel}
        </motion.span>
      )}

      {/* Knob */}
      <motion.button
        type="button"
        role="button"
        aria-label={done ? confirmedLabel : label}
        disabled={disabled || busy}
        drag={disabled || done || reduced ? false : 'x'}
        dragConstraints={{ left: 0, right: maxX }}
        dragElastic={0}
        dragMomentum={false}
        style={{ x, width: KNOB, height: KNOB }}
        onDragEnd={() => {
          if (maxX > 0 && x.get() >= maxX * threshold) fire();
          else reset();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fire();
          }
        }}
        onClick={() => {
          // Reduced-motion and pointer-less users get a plain activate.
          if (reduced) fire();
        }}
        whileTap={disabled || done ? undefined : { scale: 0.96 }}
        className={`absolute left-1 top-1 grid cursor-grab place-items-center rounded-full
          bg-white shadow-soft active:cursor-grabbing
          ${done ? 'cursor-default' : ''}`}
      >
        {done ? (
          <Check className="h-5 w-5" style={{ color: accent }} strokeWidth={3} />
        ) : (
          <ArrowRight className="h-5 w-5" style={{ color: accent }} strokeWidth={2.5} />
        )}
      </motion.button>
    </div>
  );
};
