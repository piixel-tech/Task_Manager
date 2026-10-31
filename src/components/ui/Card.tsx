import React from 'react';
import { motion, type HTMLMotionProps } from 'motion/react';
import { useMotionPrefs } from './useMotionPrefs';
import { fadeUp, fastT } from './motion';

export interface CardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  /** Lift the card slightly on hover. */
  interactive?: boolean;
  /** Visual hover lift only (bento tiles that are not clickable). */
  lift?: boolean;
  /** Opt out of the fade-up entrance (e.g. when a parent already staggers). */
  animate?: boolean;
  children?: React.ReactNode;
}

/**
 * Solid card on the paper canvas: 20px radius, hairline border,
 * very soft shadow. Never glass: lists and tables stay readable. Participates in a parent's stagger automatically
 * because it declares the shared `hidden` / `show` variants.
 */
export const Card: React.FC<CardProps> = ({
  className = '',
  children,
  interactive = false,
  lift = false,
  animate = true,
  ...props
}) => {
  const { reduced } = useMotionPrefs();

  return (
    <motion.div
      variants={animate ? fadeUp : undefined}
      whileHover={(interactive || lift) && !reduced ? { y: interactive ? -4 : -3 } : undefined}
      transition={fastT}
      className={`bg-[var(--tm-card)] border border-[var(--tm-border)] rounded-[var(--tm-radius-card)]
        shadow-soft-sm ${lift ? 'hover:shadow-soft-lg' : ''} ${interactive ? 'hover:shadow-soft-lg hover:border-[var(--tm-primary-light)] cursor-pointer' : ''}
        transition-shadow duration-[var(--tm-dur-fast)] ${className}`}
      {...props}
    >
      {children}
    </motion.div>
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => (
  <div
    className={`px-5 pt-5 pb-3 flex items-start justify-between gap-3 ${className}`}
    {...props}
  >
    {children}
  </div>
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  className = '',
  children,
  ...props
}) => (
  <h3 className={`text-[15px] font-semibold text-[var(--tm-ink)] leading-snug ${className}`} {...props}>
    {children}
  </h3>
);

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  className = '',
  children,
  ...props
}) => (
  <p className={`text-[13px] text-[var(--tm-ink-muted)] mt-0.5 leading-snug line-clamp-2 ${className}`} {...props}>
    {children}
  </p>
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => (
  <div className={`px-5 pb-5 ${className}`} {...props}>
    {children}
  </div>
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => (
  <div
    className={`px-5 py-3 border-t border-[var(--tm-border)] flex items-center justify-end gap-3 ${className}`}
    {...props}
  >
    {children}
  </div>
);
