import React from 'react';
import { Eye, Globe, Lock } from 'lucide-react';
import type { Visibility } from '../../../services/http/projectApi';

/** What each visibility means, in one line. One place, so the settings, the icons and the badges always agree. */
export const VISIBILITY: Record<Visibility, { label: string; hint: string; Icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }> = {
  private: { label: 'Private', hint: 'Only its members, heads and admins can see it.', Icon: Lock },
  view_only: { label: 'View only', hint: "Everyone in the project's company can read it, but not add, edit or post.", Icon: Eye },
  open: { label: 'Open', hint: "Everyone in the project's company can see it and work in it like a member.", Icon: Globe }
};

export const VISIBILITIES: Visibility[] = ['private', 'view_only', 'open'];

/** The small icon that tells who can see a subfolder: lock = private, eye = view only, globe = open. */
export const VisibilityIcon: React.FC<{ visibility: Visibility; className?: string }> = ({ visibility, className = 'h-3.5 w-3.5' }) => {
  const { label, hint, Icon } = VISIBILITY[visibility];
  return (
    <span title={`${label}: ${hint}`} aria-label={label} role="img" className="inline-flex shrink-0 items-center">
      <Icon className={className} strokeWidth={2.1} />
    </span>
  );
};

/** A small "View only" pill, shown where someone can read a subfolder but not work in it. */
export const ViewOnlyBadge: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    title={VISIBILITY.view_only.hint}
    className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--tm-info-bg)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--tm-info)] ${className}`}
  >
    <Eye className="h-3 w-3" strokeWidth={2.1} />
    View only
  </span>
);
