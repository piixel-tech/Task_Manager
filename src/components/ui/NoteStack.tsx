import React, { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { X } from 'lucide-react';
import { backdropVariants, fastT, spring } from './motion';
import { useMotionPrefs } from './useMotionPrefs';

export interface NoteStackItem {
  id: string;
  /** What the note shows while it sits in the stack. Keep it free of buttons. */
  collapsed: React.ReactNode;
}

export interface NoteStackProps {
  items: NoteStackItem[];
  /** The full note, shown large when one is opened. */
  renderExpanded: (id: string) => React.ReactNode;
  label: string;
  className?: string;
}

/** Soft, solid note colours from the tokens, so every accent and dark mode keeps working. */
const TINTS = [
  'var(--tm-card)',
  'color-mix(in srgb, var(--tm-accent) 26%, var(--tm-card))',
  'var(--tm-card-muted)',
  'color-mix(in srgb, var(--tm-primary-soft) 70%, var(--tm-card))'
];

const NOTE_H = 116;
const PEEK = 64;

/**
 * Cards stacked on top of each other. Hovering one slides it up out of the stack; clicking it flips and grows it
 * into a large view (shared layout), and closing returns it to its place. Purely presentational.
 */
export const NoteStack: React.FC<NoteStackProps> = ({ items, renderExpanded, label, className = '' }) => {
  const { reduced } = useMotionPrefs();
  const group = useId();
  const [openId, setOpenId] = useState<string | null>(null);
  // A note that disappears (deleted) closes the large view.
  const active = openId && items.some((i) => i.id === openId) ? openId : null;

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (document.querySelector('[aria-modal="true"]:not([data-note-overlay])')) return;
      setOpenId(null);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [active]);

  return (
    <LayoutGroup id={group}>
      <ul aria-label={label} className={`pb-2 ${className}`}>
        {items.map((item, idx) => (
          <li
            key={item.id}
            className="relative z-[var(--note-z)] hover:z-[50] focus-within:z-[50]"
            style={{ marginTop: idx === 0 ? 0 : -(NOTE_H - PEEK), height: NOTE_H, ['--note-z' as string]: idx + 1 }}
          >
            {active !== item.id && (
              <motion.div
                layoutId={`${group}-${item.id}`}
                role="button"
                tabIndex={0}
                aria-label={`Open ${label} note`}
                onClick={() => setOpenId(item.id)}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    setOpenId(item.id);
                  }
                }}
                whileHover={reduced ? undefined : { y: -18 }}
                whileFocus={reduced ? undefined : { y: -18 }}
                transition={spring}
                style={{ background: TINTS[idx % TINTS.length], borderRadius: 28, height: NOTE_H }}
                className="cursor-pointer overflow-hidden border border-[var(--tm-border)] px-6 py-4 shadow-soft-sm outline-none focus-visible:shadow-glow"
              >
                {item.collapsed}
              </motion.div>
            )}
          </li>
        ))}
      </ul>

      {createPortal(
        <AnimatePresence>
          {active && (
            <div
              key="note-overlay"
              data-note-overlay
              className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6"
              style={{ perspective: 1400 }}
            >
              <motion.div
                variants={backdropVariants}
                initial="hidden"
                animate="show"
                exit="exit"
                onClick={() => setOpenId(null)}
                className="absolute inset-0 bg-[var(--tm-scrim)] backdrop-blur-[6px]"
              />
              <motion.div
                layoutId={`${group}-${active}`}
                role="dialog"
                aria-modal="true"
                aria-label={label}
                initial={reduced ? false : { rotateY: -70 }}
                animate={{ rotateY: 0 }}
                exit={reduced ? undefined : { rotateY: -70 }}
                transition={reduced ? fastT : spring}
                style={{
                  background: TINTS[Math.max(items.findIndex((i) => i.id === active), 0) % TINTS.length],
                  borderRadius: 32
                }}
                className="relative z-10 max-h-[calc(100vh-3rem)] w-full max-w-2xl overflow-y-auto border border-[var(--tm-border)] p-7 shadow-soft-lg"
              >
                <button
                  type="button"
                  onClick={() => setOpenId(null)}
                  aria-label="Close note"
                  className="absolute right-5 top-5 z-10 grid h-10 w-10 place-items-center rounded-full bg-[var(--tm-solid)] text-[var(--tm-solid-ink)] transition-colors hover:bg-[var(--tm-solid-hover)]"
                >
                  <X className="h-[18px] w-[18px]" />
                </button>
                <div className="pr-12">{renderExpanded(active)}</div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </LayoutGroup>
  );
};
