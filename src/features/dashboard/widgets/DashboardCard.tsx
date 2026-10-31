import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/Card';
import { Skeleton } from '../../../components/ui/Skeleton';

interface DashboardCardProps {
  icon: React.ReactNode;
  title: string;
  /** Count shown as a pill beside the title. */
  badge?: number;
  /** Full page this widget opens. */
  to: string;
  cta: string;
  /** Gold accent, for the one card that needs attention first. */
  highlight?: boolean;
  className?: string;
  /** Set false when a StaggerItem around the card already animates the entrance. */
  animate?: boolean;
  children: React.ReactNode;
}

/** The bento tile every dashboard widget sits in: icon, title, and a round arrow to its full page. */
export const DashboardCard: React.FC<DashboardCardProps> = ({ icon, title, badge, to, cta, highlight, className = '', animate = true, children }) => (
  <Card lift animate={animate} className={`${highlight ? 'border-[var(--tm-accent)] ring-1 ring-[var(--tm-accent)]' : ''} ${className}`}>
    <CardContent className="flex h-full flex-col gap-3 pt-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-3 text-[15px] font-semibold text-[var(--tm-ink)]">
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full [&_svg]:h-4 [&_svg]:w-4 ${
              highlight ? 'bg-[var(--tm-accent)] text-[var(--tm-accent-ink)]' : 'bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]'
            }`}
          >
            {icon}
          </span>
          <span className="truncate">{title}</span>
          {!!badge && (
            <span className="rounded-full bg-[var(--tm-danger)] px-2 py-0.5 text-[11px] font-bold leading-none text-[var(--tm-on-primary)]">{badge}</span>
          )}
        </h2>
        <Link
          to={to}
          aria-label={cta}
          title={cta}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--tm-solid)] text-[var(--tm-solid-ink)] shadow-soft-sm transition-transform hover:-translate-y-0.5 active:scale-95"
        >
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
      {children}
    </CardContent>
  </Card>
);

export const WidgetEmpty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="rounded-[var(--tm-radius-sm)] bg-[var(--tm-card-muted)] p-4 text-[13px] font-semibold text-[var(--tm-ink-muted)]">{children}</p>
);

export const WidgetSkeleton: React.FC<{ rows?: number }> = ({ rows = 3 }) => (
  <div className="space-y-2.5" aria-busy="true">
    {Array.from({ length: rows }).map((_, i) => (
      <Skeleton key={i} className="h-10 w-full" rounded="lg" />
    ))}
  </div>
);

/** A clickable row inside a widget. */
export const RowLink: React.FC<{ to: string; children: React.ReactNode }> = ({ to, children }) => (
  <Link
    to={to}
    className="flex items-center justify-between gap-3 rounded-[var(--tm-radius-sm)] px-3 py-2.5 transition-colors hover:bg-[var(--tm-bg-sunken)]"
  >
    {children}
  </Link>
);

export const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
export const dayOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
