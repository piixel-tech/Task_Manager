import React from 'react';
import { motion, type HTMLMotionProps } from 'motion/react';
import { useMotionPrefs } from './useMotionPrefs';
import { fastT } from './motion';

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?:
    | 'primary'
    | 'secondary'
    | 'outline'
    | 'ghost'
    | 'danger'
    | 'subtle'
    /** White pill for use on a dark hero panel. */
    | 'onDark'
    /** Transparent pill with white text, for use on a dark hero panel. */
    | 'ghostDark';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  children?: React.ReactNode;
}

const sizeStyles: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'text-xs px-3.5 h-8 gap-1.5',
  md: 'text-sm px-5 h-10 gap-2',
  lg: 'text-[15px] px-6 h-12 gap-2.5',
  icon: 'h-10 w-10 p-0 gap-0'
};

const variantStyles: Record<NonNullable<ButtonProps['variant']>, string> = {
  // Filled primary
  primary:
    'bg-[var(--tm-primary)] text-white shadow-soft-sm hover:bg-[var(--tm-primary-dark)] hover:shadow-soft',
  // Outlined secondary
  secondary:
    'bg-white text-[var(--tm-primary)] border border-[var(--tm-primary)]/25 hover:border-[var(--tm-primary)]/50 hover:bg-[var(--tm-primary-softer)]',
  outline:
    'bg-white text-[var(--tm-ink)] border border-[var(--tm-border-strong)] hover:bg-[var(--tm-card-muted)] hover:border-[var(--tm-ink-muted)]',
  subtle:
    'bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)] hover:bg-[var(--tm-primary-soft)]/70',
  ghost:
    'bg-transparent text-[var(--tm-ink-soft)] hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-ink)]',
  danger: 'bg-[var(--tm-danger)] text-white shadow-soft-sm hover:brightness-95',
  onDark: 'bg-white text-[var(--tm-primary-dark)] shadow-soft-sm hover:bg-white/90',
  ghostDark: 'bg-white/12 text-white hover:bg-white/22 backdrop-blur-sm'
};

/** Pill-shaped button. Scales to 0.97 on press unless reduced motion is on. */
export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  className = '',
  disabled,
  ...props
}) => {
  const { reduced } = useMotionPrefs();

  return (
    <motion.button
      whileTap={reduced || disabled || isLoading ? undefined : { scale: 0.97 }}
      transition={fastT}
      className={`relative inline-flex items-center justify-center rounded-full font-semibold tracking-[-0.01em]
        transition-colors duration-[var(--tm-dur-fast)] ease-[var(--tm-ease)]
        disabled:opacity-50 disabled:cursor-not-allowed select-none whitespace-nowrap
        ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span
          className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-current border-t-transparent animate-spin"
          aria-hidden
        />
      ) : (
        leftIcon
      )}
      {children != null && children !== '' && <span>{children}</span>}
      {!isLoading && rightIcon}
    </motion.button>
  );
};
