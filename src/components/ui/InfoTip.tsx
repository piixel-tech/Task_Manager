import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useInRouterContext, useNavigate } from 'react-router-dom';
import { Info } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { ARTICLES, audiencesFor } from '../../features/help/helpContent';
import { basePath } from '../../features/settings/settingsMenu';

interface Props {
  /** The id of the Help answer this explains ("Learn more" opens it). */
  topic: string;
  /** One or two plain sentences. */
  children: React.ReactNode;
  className?: string;
}

const WIDTH = 288;
const EDGE = 12;

/** "Learn more": opens the matching answer in the Help centre. Its own piece because it needs the router. */
const LearnMore: React.FC<{ topic: string; onGo: () => void }> = ({ topic, onGo }) => {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  return (
    <button
      type="button"
      onClick={() => {
        onGo();
        navigate(`${basePath(role)}/settings/help?article=${encodeURIComponent(topic)}`);
      }}
      className="mt-2.5 text-[12.5px] font-bold text-[var(--tm-primary-dark)] hover:underline"
    >
      Learn more
    </button>
  );
};

/**
 * A small "i" next to a concept that is not obvious (Heads, Working now, Essentials…). It opens a short explanation in a popover,
 * with "Learn more" that opens the matching answer in the Help centre. Use it only for confusing things, not on every label.
 */
export const InfoTip: React.FC<Props> = ({ topic, children, className = '' }) => {
  const inRouter = useInRouterContext();
  const role = useAuthStore((s) => s.user?.role);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // "Learn more" only when that answer exists for this person's panel.
  const hasAnswer = ARTICLES.some((a) => a.id === topic && a.for.some((x) => audiencesFor(role, true).includes(x)));

  const close = () => setPos(null);
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (pos) return close();
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    setPos({
      left: Math.min(Math.max(r.left + r.width / 2 - WIDTH / 2, EDGE), window.innerWidth - WIDTH - EDGE),
      top: r.bottom + 8
    });
  };

  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        button.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !button.current?.contains(t)) close();
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [pos]);

  return (
    <>
      <button
        ref={button}
        type="button"
        data-hint
        aria-label="What is this?"
        aria-expanded={!!pos}
        onClick={toggle}
        className={`inline-grid h-5 w-5 shrink-0 place-items-center rounded-full align-middle text-[var(--tm-ink-muted)] transition-colors hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-ink)] focus-visible:outline-none focus-visible:shadow-glow ${className}`}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {pos &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label="Explanation"
            style={{ left: pos.left, top: pos.top, width: WIDTH }}
            className="fixed z-[125] rounded-[var(--tm-radius-md)] border border-[var(--tm-border)] bg-[var(--tm-card)] p-3.5 text-left shadow-soft-lg"
          >
            <p className="text-[13px] font-normal normal-case leading-snug tracking-normal text-[var(--tm-ink-soft)]">{children}</p>
            {hasAnswer && inRouter && <LearnMore topic={topic} onGo={close} />}
          </div>,
          document.body
        )}
    </>
  );
};
