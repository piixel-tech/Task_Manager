import React from 'react';
import { useUserStore } from '../../store/useUserStore';
import { useAuthStore } from '../../store/authStore';
import { Avatar, type AvatarProps } from './Avatar';
import type { User } from '../../types';

export interface UserAvatarProps extends Omit<AvatarProps, 'name' | 'src'> {
  userId?: string;
  user?: User | null;
  name?: string;
  src?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  userId,
  user: propUser,
  name: propName,
  src: propSrc,
  size = 'md',
  className = '',
  ring = false,
  focus
}) => {
  const storeUser = useUserStore((state) => (userId ? state.users[userId] : null));
  const currentUser = useAuthStore((state) => state.user);

  const effectiveUser = storeUser || (userId && currentUser?.id === userId ? currentUser : null) || propUser;

  const displayName = effectiveUser?.name || propName || 'User';
  const displaySrc = effectiveUser?.avatarUrl || propSrc;

  return (
    <Avatar
      name={displayName}
      src={displaySrc}
      size={size}
      className={className}
      ring={ring}
      focus={focus}
    />
  );
};
