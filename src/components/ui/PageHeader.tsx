import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { StaggerItem } from './Stagger';
import { useAuthStore } from '../../store/authStore';
import { homeForRole } from '../../app/roleHome';

export interface PageHeaderProps {
  title: React.ReactNode;
  /** The line under the title. */
  description?: React.ReactNode;
  /** The page's main button (and filters), aligned to the right on wide screens. */
  actions?: React.ReactNode;
  className?: string;
}

/** Page header every screen shares: round back button, big title with subtitle, main action on the right. */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  actions,
  className = ''
}) => {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);

  // Back to the previous page; on a page opened directly there is none, so go home.
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(role ? homeForRole(role) : '/');
  };

  return (
    <StaggerItem className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ${className}`}>
      <div className="flex min-w-0 items-center gap-4">
        <button
          type="button"
          onClick={goBack}
          aria-label="Go back"
          title="Back"
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[var(--tm-border)] bg-[var(--tm-card)]
            text-[var(--tm-ink)] shadow-soft-xs transition-colors hover:border-transparent hover:bg-[var(--tm-solid)]
            hover:text-[var(--tm-solid-ink)]"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-[30px] font-extrabold leading-[1.1] tracking-[-0.035em] text-[var(--tm-ink)] sm:text-[40px]">
            {title}
          </h1>
          {description && (
            <p className="mt-2 text-[14px] leading-relaxed text-[var(--tm-ink-muted)]">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>}
    </StaggerItem>
  );
};
