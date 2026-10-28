import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, CheckCircle2, X, XCircle } from 'lucide-react';
import { useToastStore, type ToastTone } from '../../store/useToastStore';
import { router } from '../../app/router';
import { useMotionPrefs } from './useMotionPrefs';

const TONES: Record<ToastTone, { icon: React.ReactNode; color: string }> = {
  info: { icon: <Bell className="h-4 w-4" />, color: 'var(--tm-primary)' },
  success: { icon: <CheckCircle2 className="h-4 w-4" />, color: 'var(--tm-success)' },
  error: { icon: <XCircle className="h-4 w-4" />, color: 'var(--tm-danger)' }
};

/** Top-right toast stack. Mount once at the app root. */
export const ToastHost: React.FC = () => {
  const { toasts, dismiss } = useToastStore();
  const { reduced } = useMotionPrefs();

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[90] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2.5">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const tone = TONES[t.tone];
          const open = () => {
            if (t.link) router.navigate(t.link);
            dismiss(t.id);
          };
          return (
            <motion.div
              key={t.id}
              layout={!reduced}
              initial={reduced ? false : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              role="status"
              className="pointer-events-auto flex items-start gap-3 rounded-[var(--tm-radius-lg)] border
                border-[var(--tm-border)] bg-[var(--tm-card)] p-3.5 shadow-soft-lg"
            >
              <span className="mt-0.5 shrink-0" style={{ color: tone.color }}>
                {tone.icon}
              </span>
              <button
                type="button"
                onClick={open}
                disabled={!t.link}
                className="min-w-0 flex-1 text-left disabled:cursor-default"
              >
                <span className="block text-[13px] font-bold text-[var(--tm-ink)]">{t.title}</span>
                {t.message && (
                  <span className="mt-0.5 block text-[12px] leading-snug text-[var(--tm-ink-muted)]">
                    {t.message}
                  </span>
                )}
              </button>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dismiss(t.id)}
                className="shrink-0 text-[var(--tm-ink-muted)] hover:text-[var(--tm-ink)]"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
