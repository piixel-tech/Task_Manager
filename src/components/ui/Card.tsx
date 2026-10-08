import React from 'react';
import { motion, type HTMLMotionProps } from 'motion/react';
import { useMotionPrefs } from './useMotionPrefs';
import { fadeUp, fastT } from './motion';

export interface CardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  /** Lift the card slightly on hover. */
  interactive?: boolean;
  /** Opt out of the fade-up entrance (e.g. when a parent already staggers). */
  animate?: boolean;
  children?: React.ReactNode;
}

/**
 * White card on the soft-grey canvas: 24px radius, hairline border,
 * very soft shadow. Participates in a parent's stagger automatically
 * because it declares the shared `hidden` / `show` variants.
 */
export const Card: React.FC<CardProps> = ({
  className = '',
  children,
  interactive = false,
  animate = true,
  ...props
}) => {
  const { reduced } = useMotionPrefs();

  return (
    <motion.div
      variants={animate ? fadeUp : undefined}
      whileHover={interactive && !reduced ? { y: -3 } : undefined}
      transition={fastT}
      className={`bg-[var(--tm-card)] border border-[var(--tm-border)] rounded-[var(--tm-radius-xl)]
        shadow-soft-sm ${interactive ? 'hover:shadow-soft cursor-pointer' : ''}
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
    className={`px-6 pt-6 pb-4 flex items-start justify-between gap-4 ${className}`}
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
  <h3 className={`text-[17px] font-bold text-[var(--tm-ink)] leading-snug ${className}`} {...props}>
    {children}
  </h3>
);

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  className = '',
  children,
  ...props
}) => (
  <p className={`text-[13px] text-[var(--tm-ink-muted)] mt-1 leading-relaxed ${className}`} {...props}>
    {children}
  </p>
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => (
  <div className={`px-6 pb-6 ${className}`} {...props}>
    {children}
  </div>
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => (
  <div
    className={`px-6 py-4 border-t border-[var(--tm-border)] flex items-center justify-end gap-3 ${className}`}
    {...props}
  >
    {children}
  </div>
);
