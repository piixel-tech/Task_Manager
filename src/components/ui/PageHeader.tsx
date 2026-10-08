import React from 'react';
import { StaggerItem } from './Stagger';

export interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Buttons / filters aligned to the right on wide screens. */
  actions?: React.ReactNode;
  className?: string;
}

/** Consistent page title block. */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  actions,
  className = ''
}) => (
  <StaggerItem
    className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ${className}`}
  >
    <div className="min-w-0">
      <h1 className="text-[27px] font-extrabold leading-tight tracking-[-0.03em] text-[var(--tm-ink)]">
        {title}
      </h1>
      {description && (
        <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--tm-ink-muted)]">
          {description}
        </p>
      )}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>}
  </StaggerItem>
);
