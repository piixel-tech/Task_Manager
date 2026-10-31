import React from 'react';
import { motion, type HTMLMotionProps } from 'motion/react';
import { useMotionPrefs } from './useMotionPrefs';
import { spring } from './motion';

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?:
    | 'primary'
    | 'secondary'
    | 'outline'
    | 'ghost'
    | 'danger'
    | 'subtle'
    /** Plum pill / circle (lavender in dark mode), as the round icon buttons in the design. */
    | 'solid'
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
  sm: 'text-xs px-4 h-9 gap-1.5',
  md: 'text-sm px-6 h-11 gap-2',
  lg: 'text-[15px] px-7 h-13 gap-2.5',
  icon: 'h-11 w-11 p-0 gap-0'
};

const variantStyles: Record<NonNullable<ButtonProps['variant']>, string> = {
  // Filled primary
  primary:
    'bg-[var(--tm-primary)] text-[var(--tm-on-primary)] shadow-soft-sm hover:bg-[var(--tm-primary-hover)] hover:shadow-soft hover:shadow-glow',
  solid:
    'bg-[var(--tm-solid)] text-[var(--tm-solid-ink)] shadow-soft-sm hover:bg-[var(--tm-solid-hover)] hover:shadow-soft',
  // Outlined secondary
  secondary:
    'bg-[var(--tm-card)] text-[var(--tm-primary-dark)] border border-[var(--tm-primary)]/25 hover:border-[var(--tm-primary)]/50 hover:bg-[var(--tm-primary-softer)]',
  outline:
    'bg-[var(--tm-card)] text-[var(--tm-ink)] border border-[var(--tm-border-strong)] hover:bg-[var(--tm-card-muted)] hover:border-[var(--tm-ink-muted)]',
  subtle:
    'bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)] hover:bg-[var(--tm-primary-soft)]/70',
  ghost:
    'bg-transparent text-[var(--tm-ink-soft)] hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-ink)]',
  danger: 'bg-[var(--tm-danger)] text-[var(--tm-on-primary)] shadow-soft-sm hover:brightness-95',
  onDark: 'bg-[var(--tm-on-primary)] text-[var(--tm-hero)] shadow-soft-sm hover:opacity-90',
  ghostDark: 'bg-[var(--tm-on-primary)]/12 text-[var(--tm-on-primary)] hover:bg-[var(--tm-on-primary)]/22 backdrop-blur-sm'
};

/** Pill-shaped button. Lifts on hover and springs down on press, unless reduced motion is on. */
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
      whileHover={reduced || disabled || isLoading ? undefined : { y: -1.5 }}
      whileTap={reduced || disabled || isLoading ? undefined : { scale: 0.96 }}
      transition={spring}
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
