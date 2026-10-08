import React, { useState } from 'react';

export interface AvatarProps {
  name: string;
  src?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  /** Draw a white ring — used when avatars overlap in a stack. */
  ring?: boolean;
}

export const avatarSizeClasses = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-[11px]',
  md: 'w-10 h-10 text-[13px]',
  lg: 'w-12 h-12 text-[15px]',
  xl: 'w-16 h-16 text-xl',
  '2xl': 'w-24 h-24 text-3xl'
};

/** Deterministic soft tint per person, drawn from the accent family. */
const tints = [
  'bg-[var(--tm-primary)] text-white',
  'bg-[var(--tm-primary-dark)] text-white',
  'bg-[var(--tm-primary-light)] text-[var(--tm-primary-dark)]',
  'bg-[#2f7d5a] text-white',
  'bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]'
];

export const getInitials = (n: string) => {
  if (!n) return 'U';
  const parts = n.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return parts[0].substring(0, 2).toUpperCase();
};

export const Avatar: React.FC<AvatarProps> = ({
  name,
  src,
  size = 'md',
  className = '',
  ring = false
}) => {
  const [failed, setFailed] = useState(false);

  const charCodeSum = (name || '')
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const tint = tints[charCodeSum % tints.length];
  const ringClass = ring ? 'ring-2 ring-white' : '';

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full object-cover ${avatarSizeClasses[size]} ${ringClass} ${className}`}
      />
    );
  }

  return (
    <div
      className={`shrink-0 rounded-full font-bold flex items-center justify-center
        ${tint} ${avatarSizeClasses[size]} ${ringClass} ${className}`}
      title={name}
    >
      {getInitials(name)}
    </div>
  );
};
