import React, { useEffect } from 'react';
import type { User } from '../../types';
import { useUserStore } from '../../store/useUserStore';
import { getTodayDateString } from '../../utils/time';
import { UserAvatar } from './UserAvatar';
import { Badge } from './Badge';
import { Skeleton } from './Skeleton';

export interface UserNameProps {
  user?: User | null;
  userId?: string;
  showAvatar?: boolean;
  showBadge?: boolean;
  /** Show the "· Job title" suffix. */
  showTitle?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** Stack name over job title instead of inlining them. */
  stacked?: boolean;
  className?: string;
}

export const UserName: React.FC<UserNameProps> = ({
  user: userProp,
  userId,
  showAvatar = true,
  showBadge = false,
  showTitle = true,
  size = 'md',
  stacked = false,
  className = ''
}) => {
  const targetId = userProp?.id || userId;
  const storeUser = useUserStore((state) => (targetId ? state.users[targetId] : null));
  const fetchUsers = useUserStore((state) => state.fetchUsers);

  useEffect(() => {
    if (targetId && !storeUser) {
      fetchUsers();
    }
  }, [targetId, storeUser, fetchUsers]);

  const resolvedUser = storeUser || userProp || null;

  const avatarSizes = { sm: 'sm', md: 'md', lg: 'lg' } as const;

  if (!resolvedUser) {
    return (
      <div className={`inline-flex items-center gap-2.5 ${className}`}>
        {showAvatar && <Skeleton className="h-9 w-9" rounded="full" />}
        <Skeleton className="h-3 w-24" />
      </div>
    );
  }

  const { id, name, jobTitle, company, birthday } = resolvedUser;
  const todayMMDD = getTodayDateString().slice(5);
  const isBirthday = !!birthday && birthday.endsWith(todayMMDD);

  const nameSizes = { sm: 'text-[13px]', md: 'text-[14px]', lg: 'text-[15px]' };

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      {showAvatar && <UserAvatar userId={id} user={resolvedUser} size={avatarSizes[size]} />}

      <div className={stacked ? 'min-w-0 leading-tight' : 'inline-flex flex-wrap items-center gap-1.5'}>
        <span className={`font-bold text-[var(--tm-ink)] ${nameSizes[size]}`}>{name}</span>

        {isBirthday && (
          <span
            className="inline-flex items-center gap-0.5 rounded-full bg-pink-100 px-2 py-0.5 text-[10.5px] font-extrabold text-pink-700 dark:bg-pink-950/60 dark:text-pink-300"
            title="Happy Birthday!"
          >
            🎂 HBD
          </span>
        )}

        {showTitle &&
          (stacked ? (
            <div className="truncate text-[12px] text-[var(--tm-ink-muted)]">{jobTitle}</div>
          ) : (
            <>
              <span className="text-[var(--tm-ink-muted)]">·</span>
              <span className="text-[12px] text-[var(--tm-ink-muted)]">{jobTitle}</span>
            </>
          ))}

        {showBadge && (
          <Badge
            variant={company === 'piixel' ? 'piixel' : 'unwork'}
            size="sm"
            className={`capitalize ${stacked ? 'mt-1' : ''}`}
          >
            {company}
          </Badge>
        )}
      </div>
    </div>
  );
};
