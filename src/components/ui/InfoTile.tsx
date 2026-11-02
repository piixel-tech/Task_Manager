import React from 'react';

/**
 * A labelled information card: small caps label on top, the value below, 20px inside padding, solid card on the page.
 * The task detail page's info grid and the Reviews detail use it, so both read the same.
 */
export const InfoTile: React.FC<{ label: string; hint?: string; span?: boolean; className?: string; children: React.ReactNode }> = ({
  label,
  hint,
  span,
  className = '',
  children
}) => (
  <div
    className={`grid min-w-0 content-start gap-2 rounded-[var(--tm-radius-lg)] border border-[var(--tm-border)] bg-[var(--tm-card)] p-4 ${
      span ? 'sm:col-span-2' : ''
    } ${className}`}
  >
    <span className="block text-[11.5px] font-bold uppercase tracking-wide text-[var(--tm-ink-muted)]">{label}</span>
    <div className="min-w-0 text-[13.5px] font-semibold text-[var(--tm-ink)]">{children}</div>
    {hint && <span className="block text-[11.5px] text-[var(--tm-ink-muted)]">{hint}</span>}
  </div>
);
