import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { tooltipFor } from './tooltipText';

const HOVER_DELAY_MS = 400;
const KEY_DELAY_MS = 150;
const GAP = 8;
const EDGE = 8;

/** Things a person can press or toggle. */
const CONTROL = '[data-tooltip], button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="switch"], summary';

/**
 * The tooltip's name for a control, or null when it needs none: it already shows words (its own name is visible), or it has no name.
 * `data-tooltip` is the explicit way to name a control; otherwise the aria-label (or title) of an icon-only control is used.
 */
export function tooltipSource(el: HTMLElement): { raw: string; shortcut: string } | null {
  const shortcut = el.getAttribute('data-shortcut') ?? '';
  const explicit = el.getAttribute('data-tooltip');
  if (explicit) return { raw: explicit, shortcut };
  if ((el.textContent ?? '').trim()) return null; // it has visible words: the name is already there
  const raw = el.getAttribute('aria-label') || el.getAttribute('data-native-title') || el.getAttribute('title');
  return raw ? { raw, shortcut } : null;
}

/**
 * The one tooltip for the whole app, mounted once. Hover an icon-only button, or tab to it, and its name appears above it after a short
 * delay: a verb first, one to four words, and its keyboard shortcut when it has one. It hides on leaving, pressing, scrolling or Esc.
 * Because it reads the controls themselves, every icon-only button in every panel gets one (no per-button wiring), and the browser's
 * own slower grey tooltip is switched off for them so there are never two.
 */
export const TooltipHost: React.FC = () => {
  const [tip, setTip] = useState<{ text: string; shortcut: string; x: number; y: number; bottom: number; below: boolean; id: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const current = useRef<HTMLElement | null>(null);
  const keyboard = useRef(false);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const hide = () => {
      clearTimeout(timer.current);
      current.current?.removeAttribute('aria-describedby');
      current.current = null;
      setTip(null);
    };

    const show = (el: HTMLElement, delay: number) => {
      const src = tooltipSource(el);
      if (!src) return;
      // The browser's own tooltip would appear as well: take it off this control (keeping the words for later).
      const native = el.getAttribute('title');
      if (native) {
        el.setAttribute('data-native-title', native);
        el.removeAttribute('title');
      }
      clearTimeout(timer.current);
      current.current = el;
      timer.current = setTimeout(() => {
        if (current.current !== el || !el.isConnected) return;
        const { text, shortcut } = tooltipFor(src.raw, src.shortcut);
        const r = el.getBoundingClientRect();
        const id = 'tm-tooltip';
        el.setAttribute('aria-describedby', id);
        setTip({ text, shortcut, x: r.left + r.width / 2, y: r.top, bottom: r.bottom, below: r.top < 48, id });
      }, delay);
    };

    const controlOf = (t: EventTarget | null): HTMLElement | null => ((t as Element | null)?.closest?.(CONTROL) as HTMLElement | null) ?? null;

    const onOver = (e: Event) => {
      const el = controlOf(e.target);
      if (!el || el === current.current) return;
      hide();
      show(el, HOVER_DELAY_MS);
    };
    const onOut = (e: Event) => {
      const el = controlOf(e.target);
      if (el && el === current.current && !el.contains((e as PointerEvent).relatedTarget as Node | null)) hide();
    };
    const onFocus = (e: Event) => {
      if (!keyboard.current) return; // a click focuses too; only keyboard focus shows it
      const el = controlOf(e.target);
      if (el) {
        hide();
        show(el, KEY_DELAY_MS);
      }
    };
    const onBlur = (e: Event) => {
      if (controlOf(e.target) === current.current) hide();
    };
    const onKey = (e: KeyboardEvent) => {
      keyboard.current = true;
      if (e.key === 'Escape') hide();
    };
    const onPointer = () => {
      keyboard.current = false;
      hide();
    };

    document.addEventListener('pointerover', onOver, true);
    document.addEventListener('pointerout', onOut, true);
    document.addEventListener('focusin', onFocus, true);
    document.addEventListener('focusout', onBlur, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener('pointerover', onOver, true);
      document.removeEventListener('pointerout', onOut, true);
      document.removeEventListener('focusin', onFocus, true);
      document.removeEventListener('focusout', onBlur, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, []);

  if (!tip) return null;
  // Centre over the control, but never past the screen edges.
  const half = (box.current?.offsetWidth ?? 120) / 2;
  const left = Math.min(Math.max(tip.x, half + EDGE), window.innerWidth - half - EDGE);
  return createPortal(
    <div
      ref={box}
      id={tip.id}
      role="tooltip"
      style={{ left, top: tip.below ? tip.bottom + GAP : tip.y - GAP, transform: `translate(-50%, ${tip.below ? '0' : '-100%'})` }}
      className="pointer-events-none fixed z-[130] flex items-center gap-2 whitespace-nowrap rounded-[var(--tm-radius-sm)] bg-[var(--tm-ink)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--tm-card)] shadow-soft-lg"
    >
      {tip.text}
      {tip.shortcut && (
        <kbd className="rounded bg-[var(--tm-card)]/20 px-1.5 py-0.5 font-sans text-[10.5px] font-bold tracking-wide">{tip.shortcut}</kbd>
      )}
    </div>,
    document.body
  );
};
