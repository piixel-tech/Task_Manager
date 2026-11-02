import React, { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { PillTabs, type PillTabItem } from './PillTabs';
import { heatAttrs, type Heat } from '../../utils/deadlineHeat';

/** Which row is open, and (on a phone, where the list and detail take turns) whether the detail is showing. Defaults to the first row on a wide screen. */
export function useMasterSelection<T extends { id: string }>(rows: T[]) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const selected = rows.find((r) => r.id === selectedId) ?? rows[0] ?? null;
  return {
    selected,
    open: open && selected !== null,
    select: (id: string) => {
      setSelectedId(id);
      setOpen(true);
    },
    back: () => setOpen(false)
  };
}

export interface MasterDetailProps {
  /** Segmented tabs, notched into the panel's top edge. */
  tabs?: PillTabItem[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  /** Rows (use `MasterRow`). */
  list: React.ReactNode;
  /** Shown above the rows (counts, a search). */
  listHeader?: React.ReactNode;
  /** Usually a `DetailCard`. */
  detail: React.ReactNode;
  /** Phone: the detail is showing instead of the list. */
  detailOpen: boolean;
  onBack: () => void;
  className?: string;
  /** `dark`: the tighter charcoal panel (#2A2933, 24px radius). Default keeps the original look. */
  variant?: 'default' | 'dark';
}

/**
 * Charcoal panel: the list on the left, a detail card on the right, tabs notched into the top edge.
 * On a phone the two take turns, with a back button on the detail.
 */
export const MasterDetail: React.FC<MasterDetailProps> = ({
  tabs,
  activeTab,
  onTabChange,
  list,
  listHeader,
  detail,
  detailOpen,
  onBack,
  className = '',
  variant = 'default'
}) => (
  <section className={`relative ${tabs ? 'mt-6' : ''} ${className}`}>
    {tabs && activeTab !== undefined && onTabChange && (
      // The page-coloured rim around the tabs is what makes them look cut into the panel's edge.
      <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--tm-bg)] p-1.5">
        <PillTabs tabs={tabs} activeTab={activeTab} onChange={onTabChange} showZero={variant === 'dark'} />
      </div>
    )}
    <div
      className={`grid shadow-soft lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] ${
        variant === 'dark'
          ? 'gap-5 rounded-[24px] bg-[var(--tp-panel)] p-5'
          : 'gap-4 rounded-[var(--tm-radius-xl)] bg-[var(--tm-side-bg)] p-3 sm:p-4'
      } ${tabs ? 'pt-9 sm:pt-10' : ''}`}
    >
      <div className={`${variant === 'dark' ? '' : 'tm-dark-scope'} min-w-0 flex-col gap-3 ${detailOpen ? 'hidden lg:flex' : 'flex'}`}>
        {listHeader}
        <div className="max-h-[calc(100dvh-20rem)] min-h-[240px] space-y-1.5 overflow-y-auto pr-1 lg:max-h-[calc(100dvh-16rem)]">
          {list}
        </div>
      </div>
      <div className={`min-w-0 ${detailOpen ? 'block' : 'hidden lg:block'}`}>
        <button
          type="button"
          onClick={onBack}
          className={`${variant === 'dark' ? '' : 'tm-dark-scope'} mb-3 inline-flex items-center gap-1 rounded-full px-3 py-2 text-[13px] font-bold text-[var(--tm-ink)] hover:bg-[var(--tm-bg-sunken)] lg:hidden`}
        >
          <ChevronLeft className="h-4 w-4" /> All
        </button>
        {detail}
      </div>
    </div>
  </section>
);

/** One row in the list: avatar, title, subtitle, a status chip. Selected = lavender with charcoal text. */
export const MasterRow: React.FC<{
  selected: boolean;
  onSelect: () => void;
  avatar?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  chip?: React.ReactNode;
  variant?: 'default' | 'dark';
  /** Deadline tint (see utils/deadlineHeat). Not shown on the selected row, which has its own fill. */
  heat?: Heat | null;
}> = ({ selected, onSelect, avatar, title, subtitle, chip, variant = 'default', heat = null }) => {
  const h = selected ? {} : heatAttrs(heat);
  return (
  <button
    type="button"
    onClick={onSelect}
    aria-current={selected}
    data-heat={h['data-heat']}
    style={h.style}
    className={`${h.className ?? ''} flex w-full items-center gap-3 px-3 py-3 text-left transition-colors ${
      variant === 'dark' ? 'rounded-2xl' : 'rounded-[var(--tm-radius-md)]'
    } ${
      variant === 'dark'
        ? selected
          ? 'bg-[var(--tp-row-sel)] text-[var(--tp-row-sel-ink)]'
          : 'text-[var(--tm-ink)] hover:bg-[var(--tp-row-hover)]'
        : selected
          ? 'bg-[var(--tm-solid)] text-[var(--tm-solid-ink)]'
          : 'text-[var(--tm-ink)] hover:bg-[var(--tm-bg-sunken)]'
    }`}
  >
    {avatar}
    <span className="min-w-0 flex-1">
      <span className={`block truncate text-[14px] ${variant === 'dark' ? 'font-semibold' : 'font-bold'}`}>{title}</span>
      {subtitle && (
        <span className={`mt-0.5 block truncate text-[12px] ${selected ? (variant === 'dark' ? 'text-[var(--tp-row-sel-ink)]/70' : 'text-[var(--tm-solid-ink)]/70') : variant === 'dark' ? 'text-[var(--tp-muted)]' : 'text-[var(--tm-ink-muted)]'}`}>
          {subtitle}
        </span>
      )}
    </span>
    {chip && <span className="shrink-0">{chip}</span>}
  </button>
  );
};

/** The detail: a lavender gradient card with a white title block, actions on the right, and the content below as sub-cards. */
export const DetailCard: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Chips next to the title. */
  badges?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  /** `dark`: dark card with a lavender glow; the actions sit in a row under the chips. */
  variant?: 'default' | 'dark';
  /** `dark` only: pinned to the top-right corner of the card. */
  corner?: React.ReactNode;
}> = ({ title, subtitle, badges, actions, children, variant = 'default', corner }) =>
  variant === 'dark' ? (
    <article
      data-focus-keep
      className="relative rounded-[24px] bg-[var(--tp-detail)] p-5 text-[var(--tp-text)] sm:p-6"
      style={{ backgroundImage: 'radial-gradient(ellipse 80% 140px at 50% 0%, var(--tp-glow), transparent 70%)' }}
    >
      {corner && <div className="absolute right-5 top-5 z-10 sm:right-6 sm:top-6">{corner}</div>}
      <header className={`min-w-0 ${corner ? 'pr-36' : ''}`}>
        <h2 className="text-[24px] font-semibold leading-[1.2] tracking-[-0.01em] text-[var(--tp-title)]">{title}</h2>
        {subtitle && <p className="mt-1 text-[13px] font-medium text-[var(--tp-muted)]">{subtitle}</p>}
        {badges && <div className="mt-3.5 flex flex-wrap items-center gap-2">{badges}</div>}
        {actions && <div className="mt-4 flex flex-wrap items-center gap-2.5">{actions}</div>}
      </header>
      {children && <div className="mt-5">{children}</div>}
    </article>
  ) : (
  <article
    data-focus-keep
    className="rounded-[var(--tm-radius-xl)] p-5 text-[var(--tm-detail-ink)] sm:p-6"
    style={{ backgroundImage: 'linear-gradient(135deg, var(--tm-detail) 0%, var(--tm-detail-2) 100%)' }}
  >
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-[24px] font-extrabold leading-[1.15] tracking-[-0.02em] sm:text-[28px]">{title}</h2>
        {subtitle && <p className="mt-1.5 text-[13.5px] font-medium text-[var(--tm-detail-ink)]/85">{subtitle}</p>}
        {badges && <div className="mt-3 flex flex-wrap items-center gap-2">{badges}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>}
    </header>
    {children && <div className="mt-5">{children}</div>}
  </article>
  );

/** Grid of sub-cards inside a `DetailCard`. */
export const SubGrid: React.FC<{ children: React.ReactNode; cols?: 1 | 2 | 3 }> = ({ children, cols = 2 }) => (
  <div className={`grid gap-3.5 ${cols === 1 ? '' : cols === 2 ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3'}`}>{children}</div>
);

/** A solid white card on the gradient; existing content sits in these so it keeps its normal colours. */
export const SubCard: React.FC<{ title?: React.ReactNode; span?: boolean; children: React.ReactNode }> = ({ title, span, children }) => (
  <section className={`min-w-0 rounded-[var(--tm-radius-lg)] bg-[var(--tm-card)] p-5 text-[var(--tm-ink)] shadow-soft-xs ${span ? 'md:col-span-full' : ''}`}>
    {title && <h3 className="mb-2.5 text-[11.5px] font-bold uppercase tracking-[0.1em] text-[var(--tm-ink-muted)]">{title}</h3>}
    {children}
  </section>
);
