import React, { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';

export interface FilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

export interface FilterField {
  key: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

const SELECT =
  'h-10 w-full rounded-full border border-[var(--tm-border)] bg-[var(--tm-card)] px-3.5 text-[13px] font-semibold text-[var(--tm-ink)] outline-none focus-visible:shadow-glow';

/** "Filters" button that opens a popover with one select per filter, "Clear all" and "Show N tasks". */
export const FiltersPopover: React.FC<{
  fields: FilterField[];
  activeCount: number;
  resultCount: number;
  onClearAll: () => void;
}> = ({ fields, activeCount, resultCount, onClearAll }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:shadow-glow ${
          activeCount > 0
            ? 'border-transparent bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]'
            : 'border-[var(--tm-border)] bg-[var(--tm-card)] text-[var(--tm-ink-soft)] hover:border-[var(--tm-border-strong)] hover:text-[var(--tm-ink)]'
        }`}
      >
        <SlidersHorizontal className="h-4 w-4" />
        Filters
        {activeCount > 0 && <span className="tabular-nums">· {activeCount}</span>}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Filters"
          className="glass-strong absolute right-0 top-[calc(100%+8px)] z-40 w-[min(320px,calc(100vw-2rem))] rounded-[var(--tm-radius-lg)] p-4"
        >
          <div className="space-y-3">
            {fields.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--tm-ink-muted)]">{f.label}</span>
                <select value={f.value} onChange={(e) => f.onChange(e.target.value)} className={SELECT}>
                  {f.options.map((o) => (
                    <option key={o.value || 'any'} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClearAll}
              disabled={activeCount === 0}
              className="h-10 rounded-full px-3 text-[13px] font-semibold text-[var(--tm-ink-soft)] transition-colors hover:bg-[var(--tm-bg-sunken)] disabled:opacity-40"
            >
              Clear all
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-10 rounded-full bg-[var(--tm-accent)] px-4 text-[13px] font-semibold text-[var(--tm-accent-ink)] hover:brightness-95"
            >
              Show {resultCount} {resultCount === 1 ? 'task' : 'tasks'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/** Applied filters as removable chips. */
export const FilterChips: React.FC<{ chips: FilterChip[] }> = ({ chips }) =>
  chips.length === 0 ? null : (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <span
          key={c.key}
          className="inline-flex h-7 items-center gap-1 rounded-full bg-[var(--tm-primary-soft)] pl-3 pr-1.5 text-[12px] font-semibold text-[var(--tm-primary-dark)]"
        >
          {c.label}
          <button
            type="button"
            onClick={c.onRemove}
            aria-label={`Remove filter ${c.label}`}
            className="grid h-5 w-5 place-items-center rounded-full transition-colors hover:bg-[var(--tm-bg-sunken)]"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
