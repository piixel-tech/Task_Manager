import React from 'react';
import { Avatar } from '../../../components/ui/Avatar';
import { PersonLink } from '../../../components/ui/PersonLink';
import { HeadBadge } from '../../../components/ui/HeadBadge';
import type { UserBrief } from '../../../services/http/projectApi';

/** Avatar + name, with a Head badge when the person is head of the subfolder in question. */
export const PersonChip: React.FC<{ person: UserBrief; isHead?: boolean; size?: 'xs' | 'sm' | 'md' }> = ({
  person,
  isHead = false,
  size = 'sm'
}) => (
  <span className="inline-flex min-w-0 items-center gap-2">
    <PersonLink userId={person.id} className="inline-flex min-w-0 items-center gap-2">
      <Avatar name={person.name} src={person.avatar_url ?? undefined} size={size} />
      <span className="truncate text-[13px] font-semibold text-[var(--tm-ink)]">{person.name}</span>
    </PersonLink>
    {isHead && <HeadBadge />}
  </span>
);
