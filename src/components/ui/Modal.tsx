import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { backdropVariants, modalVariants } from './motion';
import { useMotionPrefs } from './useMotionPrefs';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  /** Hide the close affordance for blocking flows. */
  hideClose?: boolean;
  /** Ignore backdrop clicks and Escape. */
  dismissible?: boolean;
}

const widthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl'
};

/** Centred dialog: blurred backdrop, scale-in panel, 24px radius. */
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 'md',
  hideClose = false,
  dismissible = true
}) => {
  const { reduced } = useMotionPrefs();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, dismissible]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            variants={backdropVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            onClick={dismissible ? onClose : undefined}
            className="absolute inset-0 bg-[rgba(22,33,28,0.34)] backdrop-blur-[4px]"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            variants={modalVariants}
            initial={reduced ? 'show' : 'hidden'}
            animate="show"
            exit={reduced ? 'show' : 'exit'}
            className={`relative z-10 flex w-full flex-col overflow-hidden
              rounded-[var(--tm-radius-xl)] bg-[var(--tm-card)] shadow-soft-lg
              ${widthClasses[maxWidth]} max-h-[calc(100vh-3rem)]`}
          >
            {(title || !hideClose) && (
              <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
                <div className="min-w-0">
                  {title && (
                    <h3 className="text-[19px] font-bold tracking-[-0.02em] text-[var(--tm-ink)]">
                      {title}
                    </h3>
                  )}
                  {description && (
                    <p className="mt-1 text-[13px] leading-relaxed text-[var(--tm-ink-muted)]">
                      {description}
                    </p>
                  )}
                </div>
                {!hideClose && (
                  <button
                    onClick={onClose}
                    aria-label="Close dialog"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full
                      text-[var(--tm-ink-muted)] transition-colors
                      hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-ink)]"
                  >
                    <X className="h-[18px] w-[18px]" />
                  </button>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-6 pb-6">{children}</div>

            {footer && (
              <div className="flex items-center justify-end gap-3 border-t border-[var(--tm-border)] px-6 py-4">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
