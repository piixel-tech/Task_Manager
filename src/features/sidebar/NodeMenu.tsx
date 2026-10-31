import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface MenuAction {
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
}

interface Props {
  /** The button that opened it; the menu hangs below (or above) it. */
  anchor: HTMLElement | null;
  title: string;
  actions: MenuAction[];
  onClose: () => void;
}

const WIDTH = 224;

/**
 * A small action list drawn at the top of the page so the sidebar's scrolling can't clip it.
 * Closes on Escape, on an outside click and on scroll; arrow keys move between items.
 */
export const NodeMenu: React.FC<Props> = ({ anchor, title, actions, onClose }) => {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor || !box.current) return;
    const a = anchor.getBoundingClientRect();
    const h = box.current.offsetHeight;
    const left = Math.max(8, Math.min(a.left, window.innerWidth - WIDTH - 8));
    const top = a.bottom + 6 + h > window.innerHeight ? Math.max(8, a.top - h - 6) : a.bottom + 6;
    setPos({ left, top });
  }, [anchor, actions.length]);

  useEffect(() => {
    box.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        anchor?.focus();
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = Array.from(box.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? []);
        const at = items.indexOf(document.activeElement as HTMLElement);
        items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose]);

  return createPortal(
    <>
      <button type="button" aria-label="Close menu" className="fixed inset-0 z-[70] cursor-default" onClick={onClose} />
      <div
        ref={box}
        role="menu"
        aria-label={title}
        style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: WIDTH }}
        className="fixed z-[71] rounded-[var(--tm-radius-md)] glass-strong p-1.5 text-[var(--tm-ink)]"
      >
        <p className="truncate px-3 pb-1 pt-1.5 text-[11px] font-extrabold uppercase tracking-wide text-[var(--tm-ink-muted)]">{title}</p>
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              a.onSelect();
            }}
            className={`flex w-full items-center gap-2.5 rounded-full px-3 py-2 text-left text-[13px] font-semibold outline-none hover:bg-[var(--tm-bg-sunken)] focus-visible:bg-[var(--tm-bg-sunken)] ${
              a.danger ? 'text-[var(--tm-danger)]' : 'text-[var(--tm-ink)]'
            }`}
          >
            {a.icon}
            {a.label}
          </button>
        ))}
      </div>
    </>,
    document.body
  );
};
