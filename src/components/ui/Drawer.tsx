import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { backdropVariants, drawerVariants } from './motion';
import { useMotionPrefs } from './useMotionPrefs';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Sticky footer area, e.g. for a SlideToConfirm. */
  footer?: React.ReactNode;
  width?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

const widths = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-xl'
};

/** Right-side panel that slides in over a blurred backdrop. */
export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  description,
  footer,
  width = 'md',
  children
}) => {
  const { reduced } = useMotionPrefs();

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex justify-end" role="dialog" aria-modal="true">
          <motion.div
            variants={backdropVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            onClick={onClose}
            className="absolute inset-0 bg-[rgba(22,33,28,0.32)] backdrop-blur-[3px]"
          />

          <motion.aside
            variants={drawerVariants}
            initial={reduced ? 'show' : 'hidden'}
            animate="show"
            exit={reduced ? 'show' : 'exit'}
            drag={reduced ? false : 'x'}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0, right: 0.35 }}
            onDragEnd={(_, info) => {
              if (info.offset.x > 120 || info.velocity.x > 520) onClose();
            }}
            className={`relative flex h-full w-full ${widths[width]} flex-col
              bg-[var(--tm-card)] shadow-soft-lg
              sm:my-3 sm:mr-3 sm:h-[calc(100%-1.5rem)] sm:rounded-[var(--tm-radius-xl)]`}
          >
            {(title || description) && (
              <header className="flex items-start justify-between gap-4 border-b border-[var(--tm-border)] px-6 py-5">
                <div className="min-w-0">
                  {title && (
                    <h2 className="truncate text-[19px] font-bold tracking-[-0.02em] text-[var(--tm-ink)]">
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p className="mt-1 text-[13px] text-[var(--tm-ink-muted)]">{description}</p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close panel"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full
                    text-[var(--tm-ink-muted)] transition-colors hover:bg-[var(--tm-bg-sunken)]
                    hover:text-[var(--tm-ink)]"
                >
                  <X className="h-[18px] w-[18px]" />
                </button>
              </header>
            )}

            <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>

            {footer && (
              <footer className="border-t border-[var(--tm-border)] px-6 py-5">{footer}</footer>
            )}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
};
