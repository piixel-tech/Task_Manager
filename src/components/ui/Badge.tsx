import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?:
    | 'default'
    | 'primary'
    | 'success'
    | 'warning'
    | 'danger'
    | 'info'
    | 'piixel'
    | 'unwork'
    | 'both';
  size?: 'sm' | 'md';
}

/**
 * Small pastel label. Shares the chip palette with `StatusChip`; company
 * badges (piixel / unwork / both) keep their own distinct hues.
 */
export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  className = '',
  ...props
}) => {
  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5',
    md: 'text-[11px] px-2.5 py-1'
  };

  const variantStyles = {
    default:
      'bg-[var(--tm-neutral-bg)] text-[var(--tm-neutral)] ring-[var(--tm-neutral-ring)]',
    primary:
      'bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)] ring-[color-mix(in_srgb,var(--tm-primary-light)_55%,transparent)]',
    success:
      'bg-[var(--tm-success-bg)] text-[var(--tm-success)] ring-[var(--tm-success-ring)]',
    warning:
      'bg-[var(--tm-warning-bg)] text-[var(--tm-warning)] ring-[var(--tm-warning-ring)]',
    danger: 'bg-[var(--tm-danger-bg)] text-[var(--tm-danger)] ring-[var(--tm-danger-ring)]',
    info: 'bg-[var(--tm-info-bg)] text-[var(--tm-info)] ring-[var(--tm-info-ring)]',
    piixel:
      'bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)] ring-[color-mix(in_srgb,var(--tm-primary)_18%,transparent)]',
    unwork: 'bg-[var(--tm-warning-bg)] text-[var(--tm-warning)] ring-[var(--tm-warning-ring)]',
    both: 'bg-[var(--tm-info-bg)] text-[var(--tm-info)] ring-[var(--tm-info-ring)]'
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold leading-none
        ring-1 ring-inset ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};
