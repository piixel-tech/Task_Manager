import React from 'react';
import { isFestivalApplied, useFestivalStore } from '../../store/useFestivalStore';

const label = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short' });

/** A small festive strip while a festival theme is live: its greeting, when it ends, and a switch back to your own theme. */
export const FestivalBanner: React.FC = () => {
  const f = useFestivalStore((s) => s.active);
  const applied = useFestivalStore((s) => isFestivalApplied(s));
  const useOwn = useFestivalStore((s) => s.useOwnTheme);
  const useFestival = useFestivalStore((s) => s.useFestivalTheme);
  if (!f) return null;
  return (
    <div role="status" className="tm-festival-banner mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-full px-4 py-2 text-[13px] font-semibold">
      {f.emoji && (
        <span aria-hidden className="text-[16px] leading-none">
          {f.emoji}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{f.greeting}</span>
      <span className="hidden text-[12px] font-medium opacity-70 sm:inline">Until {label(f.end_date)}</span>
      <button
        type="button"
        onClick={applied ? useOwn : useFestival}
        className="rounded-full bg-[var(--tm-card)] px-3 py-1 text-[12px] font-bold text-[var(--tm-primary-dark)] hover:opacity-90"
      >
        {applied ? 'Use my theme' : `Use ${f.name} theme`}
      </button>
    </div>
  );
};
