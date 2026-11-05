import React from 'react';
import { Avatar } from '../../../components/ui/Avatar';
import type { UserBrief } from '../../../services/http/projectApi';

/** The green "active right now" dot, on the corner of an avatar. */
export const LiveDot: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span aria-hidden className={`absolute flex h-2.5 w-2.5 ${className}`}>
    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--tm-success)] opacity-60" />
    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--tm-success)] ring-2 ring-[var(--tm-card)]" />
  </span>
);

/** Avatars (with a live dot) of the people who have a timer running on a task. Shows nothing when nobody does. */
export const WorkingAvatars: React.FC<{ people: UserBrief[]; className?: string }> = ({ people, className = '' }) => {
  if (people.length === 0) return null;
  const shown = people.slice(0, 3);
  return (
    <span
      className={`inline-flex items-center ${className}`}
      title={`${people.map((p) => p.name).join(', ')} ${people.length === 1 ? 'is' : 'are'} working on this now`}
    >
      <span className="flex -space-x-2">
        {shown.map((p) => (
          <span key={p.id} className="relative rounded-full ring-2 ring-[var(--tm-card)]">
            <Avatar name={p.name} src={p.avatar_url ?? undefined} size="xs" />
            <LiveDot className="-bottom-0.5 -right-0.5" />
          </span>
        ))}
      </span>
      {people.length > shown.length && (
        <span className="ml-1.5 text-[11px] font-bold text-[var(--tm-ink-soft)]">+{people.length - shown.length}</span>
      )}
      <span className="sr-only">Working now</span>
    </span>
  );
};
