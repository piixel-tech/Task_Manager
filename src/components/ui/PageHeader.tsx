import React from 'react';
import { useIsPhone } from '../../hooks/useBreakpoint';
import { StaggerItem } from './Stagger';
import { BackButton } from './BackButton';

export interface PageHeaderProps {
  title: React.ReactNode;
  /** The line under the title. */
  description?: React.ReactNode;
  /** The page's main button (and filters), aligned to the right on wide screens. */
  actions?: React.ReactNode;
  /** Shows the back button: previous page if the person came from inside the app, otherwise this parent page. */
  backTo?: string;
  /** Only show the back button on phones. */
  backPhoneOnly?: boolean;
  className?: string;
}

/** Page header every screen shares: (detail pages only) round back button, big title with subtitle, main action on the right. */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  actions,
  backTo,
  backPhoneOnly = false,
  className = ''
}) => {
  const phone = useIsPhone();

  return (
    <StaggerItem className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ${className}`}>
      <div className="flex min-w-0 items-center gap-4">
        {backTo && (!backPhoneOnly || phone) && <BackButton fallback={backTo} />}
        <div className="min-w-0">
          <h1 className="text-[30px] font-extrabold leading-[1.1] tracking-[-0.035em] text-[var(--tm-ink)] sm:text-[40px]">
            {title}
          </h1>
          {description && (
            <p data-hint className="mt-2 text-[14px] leading-relaxed text-[var(--tm-ink-muted)]">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>}
    </StaggerItem>
  );
};
