import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useMotionPrefs } from './useMotionPrefs';

export interface CountBadgeProps {
  count?: number;
  /** Position/size overrides, e.g. the corner offset. */
  className?: string;
}

/** WhatsApp-style unread badge: red round, white bold number, "99+" above 99, hidden at 0, pops when the number changes. */
export const CountBadge: React.FC<CountBadgeProps> = ({ count = 0, className = '' }) => {
  const { reduced } = useMotionPrefs();
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.span
          key={count > 99 ? '99+' : count}
          initial={reduced ? false : { scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={reduced ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
          transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 600, damping: 18 }}
          aria-label={`${count} unread`}
          className={`grid h-4 min-w-4 place-items-center rounded-full bg-[var(--tm-danger)] px-1 text-[10px] font-bold leading-none tabular-nums text-white ${className}`}
        >
          {count > 99 ? '99+' : count}
        </motion.span>
      )}
    </AnimatePresence>
  );
};
