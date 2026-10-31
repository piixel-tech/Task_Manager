import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Calendar, Check, ChevronDown, Search, X } from 'lucide-react';
import { useMotionPrefs } from './useMotionPrefs';
import { popoverVariants } from './motion';

const PILL =
  'inline-flex h-11 items-center gap-2 rounded-full border px-4 text-[13px] font-semibold transition-colors ' +
  'focus-visible:outline-none focus-visible:shadow-glow';
const PILL_IDLE =
  'border-[var(--tm-border)] bg-[var(--tm-card)] text-[var(--tm-ink-soft)] hover:border-[var(--tm-border-strong)] hover:text-[var(--tm-ink)]';
const PILL_ACTIVE = 'border-transparent bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]';

export interface FilterOption {
  value: string;
  label: string;
}

/** A filter as a pill that opens a list of options. Active (tinted) whenever the value differs from `allValue`. */
export const FilterPill: React.FC<{
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  /** The value that means "no filter". */
  allValue?: string;
  icon?: React.ReactNode;
}> = ({ label, value, options, onChange, allValue = '', icon }) => {
  const { reduced } = useMotionPrefs();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = value !== allValue;
  const current = options.find((o) => o.value === value);

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
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`${PILL} ${active ? PILL_ACTIVE : PILL_IDLE}`}
      >
        {icon}
        <span className="text-[var(--tm-ink-muted)]">{label}</span>
        {active && <span className="max-w-[140px] truncate font-bold">{current?.label ?? value}</span>}
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            variants={popoverVariants}
            initial={reduced ? 'show' : 'hidden'}
            animate="show"
            exit={reduced ? 'show' : 'exit'}
            className="glass-strong absolute left-0 top-[calc(100%+8px)] z-40 max-h-72 min-w-[200px] origin-top-left overflow-y-auto
              rounded-[var(--tm-radius-lg)] p-2"
          >
            {options.map((o) => {
              const selected = o.value === value;
              return (
                <li key={o.value || 'all'} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-full px-3.5 py-2 text-left text-[13px] font-semibold transition-colors ${
                      selected
                        ? 'bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]'
                        : 'text-[var(--tm-ink-soft)] hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-ink)]'
                    }`}
                  >
                    <span className="truncate">{o.label}</span>
                    {selected && <Check className="h-4 w-4 shrink-0" />}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
};

/** A date (or month) picker as a pill. */
export const FilterDate: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'date' | 'month';
  min?: string;
  max?: string;
  /** Tints the pill; defaults to "has a value". */
  active?: boolean;
}> = ({ label, value, onChange, type = 'date', min, max, active }) => {
  const on = active ?? value !== '';
  return (
    <label className={`${PILL} cursor-pointer ${on ? PILL_ACTIVE : PILL_IDLE}`}>
      <Calendar className="h-4 w-4 shrink-0" />
      <span className="text-[var(--tm-ink-muted)]">{label}</span>
      <input
        type={type}
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 border-none bg-transparent font-bold text-inherit outline-none"
      />
    </label>
  );
};

/** Search field as a pill. */
export const FilterSearch: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder = 'Search' }) => (
  <label
    className="flex h-11 min-w-[200px] flex-1 items-center gap-2 rounded-full border border-[var(--tm-border)] bg-[var(--tm-card)] px-4
      text-[var(--tm-ink-muted)] transition-[border-color,box-shadow] focus-within:border-[var(--tm-primary-light)] focus-within:shadow-glow sm:max-w-[320px]"
  >
    <Search className="h-4 w-4 shrink-0" />
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-[var(--tm-ink)] outline-none placeholder:text-[var(--tm-ink-muted)]"
    />
  </label>
);

/** One row for every filter a page has: search, pill dropdowns, date pickers, and how many are on. */
export const FilterBar: React.FC<{
  children: React.ReactNode;
  /** How many filters differ from their default. */
  activeCount?: number;
  onClear?: () => void;
  /** Filters set from outside (a stat card, a link), shown as removable chips. */
  chips?: { key: string; label: string; onRemove: () => void }[];
  className?: string;
}> = ({ children, activeCount = 0, onClear, chips = [], className = '' }) => (
  <div
    role="group"
    aria-label="Filters"
    className={`flex flex-wrap items-center gap-2.5 rounded-[var(--tm-radius-lg)] bg-[var(--tm-card-muted)] p-2.5 ${className}`}
  >
    {children}
    {chips.map((c) => (
      <span
        key={c.key}
        className="inline-flex h-8 items-center gap-1 rounded-full bg-[var(--tm-primary-soft)] pl-3 pr-1.5 text-[12px] font-bold text-[var(--tm-primary-dark)]"
      >
        {c.label}
        <button
          type="button"
          onClick={c.onRemove}
          aria-label={`Clear ${c.label}`}
          className="grid h-5 w-5 place-items-center rounded-full transition-colors hover:bg-[var(--tm-bg-sunken)]"
        >
          <X className="h-3 w-3" />
        </button>
      </span>
    ))}
    {onClear && (
      <div className="ml-auto flex items-center gap-2">
        <span
          className={`inline-flex h-8 items-center rounded-full px-3 text-[12px] font-bold tabular-nums ${
            activeCount > 0 ? 'bg-[var(--tm-accent)] text-[var(--tm-accent-ink)]' : 'text-[var(--tm-ink-muted)]'
          }`}
        >
          {activeCount} active
        </span>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-[12px] font-bold text-[var(--tm-ink-soft)] transition-colors hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-ink)]"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>
    )}
  </div>
);
