import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * A panel that slides up from the bottom edge, for phones. Taps on the dimmed area or Esc close it, its content scrolls inside,
 * and it keeps clear of the home bar. Only phone-only screens use it, so desktop never renders it.
 */
export const BottomSheet: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; dark?: boolean }> = ({ isOpen, onClose, title, children, dark = false }) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  return createPortal(
    <div className="fixed inset-0 z-[75]">
      <div className="absolute inset-0 bg-[var(--tm-scrim)] backdrop-blur-[4px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`${dark ? 'tm-sidebar' : 'glass-strong'} absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-[var(--tm-radius-xl)] pb-[env(safe-area-inset-bottom)]`}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[var(--tm-border-strong)]" aria-hidden />
        <div className="flex items-center justify-between px-5 pb-2 pt-3">
          <h3 className="text-[16px] font-extrabold text-[var(--tm-ink)]">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-full bg-[var(--tm-solid)] text-[var(--tm-solid-ink)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
      </div>
    </div>,
    document.body
  );
};
