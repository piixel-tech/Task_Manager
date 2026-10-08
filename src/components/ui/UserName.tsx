import React, { useEffect, useState } from 'react';
import type { User } from '../../types';
import { userService } from '../../services';
import { getTodayDateString } from '../../utils/time';
import { Avatar } from './Avatar';
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

const userCache = new Map<string, User>();

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
  const [resolvedUser, setResolvedUser] = useState<User | null>(userProp || null);

  useEffect(() => {
    if (userProp) {
      setResolvedUser(userProp);
      if (userProp.id) userCache.set(userProp.id, userProp);
      return;
    }

    if (userId) {
      if (userCache.has(userId)) {
        setResolvedUser(userCache.get(userId)!);
      } else {
        userService.getUserById(userId).then((u) => {
          if (u) {
            userCache.set(userId, u);
            setResolvedUser(u);
          }
        });
      }
    }
  }, [userProp, userId]);

  const avatarSizes = { sm: 'sm', md: 'md', lg: 'lg' } as const;

  if (!resolvedUser) {
    return (
      <div className={`inline-flex items-center gap-2.5 ${className}`}>
        {showAvatar && <Skeleton className="h-9 w-9" rounded="full" />}
        <Skeleton className="h-3 w-24" />
      </div>
    );
  }

  const { name, jobTitle, company, avatarUrl, birthday } = resolvedUser;
  const todayMMDD = getTodayDateString().slice(5);
  const isBirthday = !!birthday && birthday.endsWith(todayMMDD);

  const nameSizes = { sm: 'text-[13px]', md: 'text-[14px]', lg: 'text-[15px]' };

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      {showAvatar && <Avatar name={name} src={avatarUrl} size={avatarSizes[size]} />}

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
