import React from 'react';
import { Avatar } from '../../../components/ui/Avatar';
import { PersonLink } from '../../../components/ui/PersonLink';
import { HeadBadge } from '../../../components/ui/HeadBadge';
import type { UserBrief } from '../../../services/http/projectApi';
import { LiveDot } from './WorkingAvatars';

/** Avatar + name, with a Head badge when the person is head of the subfolder in question. */
export const PersonChip: React.FC<{ person: UserBrief; isHead?: boolean; size?: 'xs' | 'sm' | 'md'; active?: boolean }> = ({
  person,
  isHead = false,
  size = 'sm',
  active = false
}) => (
  <span className="inline-flex min-w-0 items-center gap-2">
    <PersonLink userId={person.id} className="inline-flex min-w-0 items-center gap-2">
      <span className="relative shrink-0">
        <Avatar name={person.name} src={person.avatar_url ?? undefined} size={size} />
        {active && <LiveDot className="-bottom-0.5 -right-0.5" />}
      </span>
      <span className="truncate text-[13px] font-semibold text-[var(--tm-ink)]">{person.name}</span>
    </PersonLink>
    {active && <span className="shrink-0 rounded-full bg-[var(--tm-success-bg)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--tm-success)]">Working now</span>}
    {isHead && <HeadBadge />}
  </span>
);
