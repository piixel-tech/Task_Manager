import React from 'react';
import { motion } from 'motion/react';
import { avatarSizeClasses, type AvatarProps } from './Avatar';
import { UserAvatar } from './UserAvatar';
import { useMotionPrefs } from './useMotionPrefs';
import { fastT } from './motion';

export interface AvatarStackPerson {
  id?: string;
  name: string;
  avatarUrl?: string;
}

export interface AvatarStackProps {
  people: AvatarStackPerson[];
  max?: number;
  size?: AvatarProps['size'];
  className?: string;
  /** Spread the stack apart slightly on hover. */
  spreadOnHover?: boolean;
}

/** Overlapping avatars with a "+N" remainder chip. */
export const AvatarStack: React.FC<AvatarStackProps> = ({
  people,
  max = 4,
  size = 'sm',
  className = '',
  spreadOnHover = true
}) => {
  const { reduced } = useMotionPrefs();
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;

  if (people.length === 0) return null;

  return (
    <div
      className={`group/stack flex items-center ${className}`}
      aria-label={people.map((p) => p.name).join(', ')}
    >
      {shown.map((person, i) => (
        <motion.div
          key={person.id ?? `${person.name}-${i}`}
          className={i === 0 ? '' : '-ml-2.5'}
          whileHover={spreadOnHover && !reduced ? { y: -3, scale: 1.06 } : undefined}
          transition={fastT}
          style={{ zIndex: shown.length - i }}
        >
          <UserAvatar userId={person.id} name={person.name} src={person.avatarUrl} size={size} ring />
        </motion.div>
      ))}

      {extra > 0 && (
        <div
          className={`-ml-2.5 flex items-center justify-center rounded-full
            bg-[var(--tm-bg-sunken)] font-bold text-[var(--tm-ink-soft)] ring-2 ring-[var(--tm-card)]
            ${avatarSizeClasses[size ?? 'sm']}`}
          title={people
            .slice(max)
            .map((p) => p.name)
            .join(', ')}
        >
          +{extra}
        </div>
      )}
    </div>
  );
};
