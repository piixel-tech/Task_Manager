import React from 'react';
import { Eye, EyeOff, UserCheck } from 'lucide-react';
import type { Visibility } from '../../../services/http/projectApi';

/**
 * Who can see a subfolder, in one line each. One place, so the dropdown, the icons in the title, the sidebar and the cards always agree.
 * Whoever is not a member can only ever read it, whatever is chosen.
 */
export const VISIBILITY: Record<Visibility, { label: string; hint: string; Icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }> = {
  hidden: { label: 'Hidden', hint: 'Only members of this subfolder can see it.', Icon: EyeOff },
  everyone: { label: 'Visible to everyone', hint: 'Everyone in the company can view. Only members can make changes.', Icon: Eye },
  selected: { label: 'Visible to selected people', hint: 'Only the people you pick can view. Only members can make changes.', Icon: UserCheck }
};

export const VISIBILITIES: Visibility[] = ['hidden', 'everyone', 'selected'];

/** The small icon that tells who can see a subfolder: crossed eye = hidden, eye = everyone, eye-and-tick person = selected people. */
export const VisibilityIcon: React.FC<{ visibility: Visibility; className?: string }> = ({ visibility, className = 'h-3.5 w-3.5' }) => {
  const { label, hint, Icon } = VISIBILITY[visibility];
  return (
    <span title={`${label}: ${hint}`} aria-label={label} role="img" className="inline-flex shrink-0 items-center">
      <Icon className={className} strokeWidth={2.1} />
    </span>
  );
};

/** A small "View only" pill, shown where someone can read a subfolder but is not a member (so cannot make changes). */
export const ViewOnlyBadge: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    title="You can view this subfolder. Only its members can make changes."
    className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--tm-info-bg)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--tm-info)] ${className}`}
  >
    <Eye className="h-3 w-3" strokeWidth={2.1} />
    View only
  </span>
);
