import React from 'react';
import { motion, type HTMLMotionProps } from 'motion/react';
import { fadeUp, staggerParent } from './motion';

export interface StaggerProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  /** Seconds between children. */
  stagger?: number;
  delay?: number;
  children?: React.ReactNode;
}

/**
 * Wraps a page or section so that any child declaring the shared
 * `hidden` / `show` variants (Card, StatCard, HeroCard, StaggerItem…)
 * fades up in sequence on mount.
 */
export const Stagger: React.FC<StaggerProps> = ({
  stagger = 0.055,
  delay = 0.02,
  className = '',
  children,
  ...props
}) => (
  <motion.div
    variants={staggerParent(stagger, delay)}
    initial="hidden"
    animate="show"
    className={className}
    {...props}
  >
    {children}
  </motion.div>
);

/** Opt any plain element into the parent's stagger. */
export const StaggerItem: React.FC<StaggerProps> = ({ className = '', children, ...props }) => (
  <motion.div variants={fadeUp} className={className} {...props}>
    {children}
  </motion.div>
);
