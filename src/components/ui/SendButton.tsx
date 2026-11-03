import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Send } from 'lucide-react';
import { useMotionPrefs } from './useMotionPrefs';
import { EASE_OUT } from './motion';

export type SendStatus = 'idle' | 'sending' | 'sent' | 'error';

export interface SendButtonProps {
  status: SendStatus;
  onClick: () => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

/** How long the "Sent!" pill stays before the button goes back to normal. */
export const SENT_PILL_MS = 1500;

/** Dashed, curved path the plane leaves behind. */
const TRAIL = 'M0 0 C 16 -2, 40 -8, 64 -36';

/**
 * The send button for submits, requests, bookings and invites. Pressing it turns the plane icon into a paper plane that flies
 * off along a curved dashed trail; on success the button morphs into a pill with a check circle and "Sent!" and goes back to
 * normal after 1.5 s; on failure it shakes and reads "Failed · Retry" (click again to retry).
 * Controlled: the caller says what the action is doing. Reduced motion: the plane, trail, morph and shake are replaced by instant swaps.
 */
export const SendButton: React.FC<SendButtonProps> = ({ status, onClick, label = 'Send', disabled = false, className = '' }) => {
  const { reduced } = useMotionPrefs();
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (status !== 'sent') return;
    const t = setTimeout(() => setSettled(true), SENT_PILL_MS);
    return () => {
      clearTimeout(t);
      setSettled(false);
    };
  }, [status]);

  const view: SendStatus = status === 'sent' && settled ? 'idle' : status;
  const tone =
    view === 'sent'
      ? 'bg-[var(--tm-success)] text-[var(--tm-on-primary)]'
      : view === 'error'
        ? 'bg-[var(--tm-danger)] text-[var(--tm-on-primary)]'
        : 'bg-[var(--tm-primary)] text-[var(--tm-on-primary)] hover:bg-[var(--tm-primary-hover)]';
  const swap = reduced ? { duration: 0 } : { duration: 0.22, ease: EASE_OUT };

  return (
    <motion.button
      type="button"
      layout={reduced ? false : 'size'}
      transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}
      onClick={onClick}
      disabled={disabled || view === 'sending' || view === 'sent'}
      data-status={view}
      aria-live="polite"
      className={`relative inline-flex h-11 select-none items-center justify-center whitespace-nowrap rounded-full px-6 text-sm font-semibold shadow-soft-sm
        transition-colors duration-300 disabled:cursor-default ${view === 'idle' ? 'disabled:opacity-50' : ''} ${tone} ${view === 'error' && !reduced ? 'tm-shake' : ''} ${className}`}
    >
      {/* The trail the plane leaves */}
      {view === 'sending' && !reduced && (
        <svg aria-hidden className="pointer-events-none absolute left-4 top-1/2 h-[60px] w-[90px] overflow-visible" viewBox="0 -50 90 60">
          <motion.path
            d={TRAIL}
            fill="none"
            stroke="var(--tm-primary)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray="3 6"
            initial={{ opacity: 0, strokeDashoffset: 0 }}
            animate={{ opacity: [0, 1, 0.8, 0], strokeDashoffset: -24 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          />
        </svg>
      )}

      <AnimatePresence mode="popLayout" initial={false}>
        {view === 'sent' ? (
          <motion.span key="sent" className="flex items-center gap-2" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={swap}>
            <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--tm-on-primary)] text-[var(--tm-success)]">
              <Check className="h-4 w-4" strokeWidth={3} />
            </span>
            Sent!
          </motion.span>
        ) : view === 'error' ? (
          <motion.span key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={swap}>
            Failed · Retry
          </motion.span>
        ) : (
          <motion.span key="main" className="flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={swap}>
            <motion.span
              aria-hidden
              className="inline-flex"
              animate={
                view === 'sending' && !reduced
                  ? { x: [0, 22, 64], y: [0, -8, -36], rotate: [0, -12, -24], scale: [1, 1, 0.6], opacity: [1, 1, 0] }
                  : { x: 0, y: 0, rotate: 0, scale: 1, opacity: view === 'sending' ? 0 : 1 }
              }
              transition={{ duration: view === 'sending' && !reduced ? 0.6 : 0, ease: [0.4, 0, 0.2, 1] }}
            >
              <Send className="h-4 w-4" />
            </motion.span>
            {view === 'sending' ? 'Sending…' : label}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
};

/**
 * The mini version for chat: a small paper plane that flies out of the send button in about 300 ms. Put it inside a `relative`
 * wrapper around the button and bump `fire` on every send; nothing renders for reduced motion.
 */
export const SendFlight: React.FC<{ fire: number }> = ({ fire }) => {
  const { reduced } = useMotionPrefs();
  if (!fire || reduced) return null;
  return (
    <motion.span
      key={fire}
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 z-20 -ml-2 -mt-2 text-[var(--tm-primary)]"
      initial={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
      animate={{ x: 44, y: -34, opacity: 0, scale: 0.6, rotate: -22 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
    >
      <Send className="h-4 w-4" />
    </motion.span>
  );
};
