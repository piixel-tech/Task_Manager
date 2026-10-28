import React, { useState } from 'react';
import { AuthImage } from './AuthImage';
import {
  Award,
  Briefcase,
  Code,
  Coffee,
  Crown,
  Flame,
  Heart,
  Laptop,
  Shield,
  Smile,
  Sparkles,
  Star,
  User as UserIcon,
  Zap
} from 'lucide-react';

export interface AvatarProps {
  name: string;
  src?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  /** Draw a white ring — used when avatars overlap in a stack. */
  ring?: boolean;
  /** Show a 🌙: this person is in Focus mode. */
  focus?: boolean;
}

export const avatarSizeClasses = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-[11px]',
  md: 'w-10 h-10 text-[13px]',
  lg: 'w-12 h-12 text-[15px]',
  xl: 'w-16 h-16 text-xl',
  '2xl': 'w-24 h-24 text-3xl'
};

const iconSizes = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
  xl: 'w-8 h-8',
  '2xl': 'w-12 h-12'
};

export const AVATAR_ICONS: Record<string, React.ElementType> = {
  Star,
  Shield,
  Zap,
  Smile,
  Heart,
  User: UserIcon,
  Sparkles,
  Briefcase,
  Coffee,
  Code,
  Flame,
  Award,
  Crown,
  Laptop
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

const AvatarBase: React.FC<AvatarProps> = ({
  name,
  src,
  size = 'md',
  className = '',
  ring = false
}) => {
  const [failed, setFailed] = useState(false);

  const ringClass = ring ? 'ring-2 ring-white' : '';

  if (src && !failed) {
    if (src.startsWith('initials:')) {
      const bgColor = src.split(':')[1] || '#0F3D27';
      return (
        <div
          className={`shrink-0 rounded-full font-bold text-white flex items-center justify-center ${avatarSizeClasses[size]} ${ringClass} ${className}`}
          style={{ backgroundColor: bgColor }}
          title={name}
        >
          {getInitials(name)}
        </div>
      );
    }

    if (src.startsWith('icon:')) {
      const [, iconName, bgColor] = src.split(':');
      const IconComponent = AVATAR_ICONS[iconName] || Star;
      const bg = bgColor || '#0F3D27';
      return (
        <div
          className={`shrink-0 rounded-full text-white flex items-center justify-center ${avatarSizeClasses[size]} ${ringClass} ${className}`}
          style={{ backgroundColor: bg }}
          title={name}
        >
          <IconComponent className={iconSizes[size]} />
        </div>
      );
    }

    if (src.startsWith('emoji:')) {
      const [, emojiChar, bgColor] = src.split(':');
      const bg = bgColor || '#0F3D27';
      return (
        <div
          className={`shrink-0 rounded-full flex items-center justify-center ${avatarSizeClasses[size]} ${ringClass} ${className}`}
          style={{ backgroundColor: bg }}
          title={name}
        >
          <span className="leading-none">{emojiChar || '🚀'}</span>
        </div>
      );
    }

    if (src.startsWith('/api/')) {
      // An uploaded photo: served only to signed-in people, so it is fetched with the login token.
      return <AuthImage url={src} alt={name} className={`shrink-0 rounded-full object-cover ${avatarSizeClasses[size]} ${ringClass} ${className}`} />;
    }

    return (
      <img
        src={src}
        alt={name}
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full object-cover ${avatarSizeClasses[size]} ${ringClass} ${className}`}
      />
    );
  }

  const charCodeSum = (name || '')
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const tint = tints[charCodeSum % tints.length];

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

/** A person's avatar; with `focus`, a small moon marks them as in Focus mode. */
export const Avatar: React.FC<AvatarProps> = ({ focus, ...rest }) =>
  focus ? (
    <span className="relative inline-flex shrink-0" title={`${rest.name} is in focus`}>
      <AvatarBase {...rest} />
      <span
        aria-label="In focus"
        className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-[var(--tm-card)] text-[10px] leading-none shadow-soft-xs ring-1 ring-[var(--tm-border)]"
      >
        🌙
      </span>
    </span>
  ) : (
    <AvatarBase {...rest} />
  );

