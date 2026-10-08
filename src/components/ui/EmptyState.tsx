import React from 'react';
import { FolderOpen } from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from './Button';
import { fadeUp } from './motion';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

/** Hatched panel for "nothing here yet" — the empty-value texture. */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = ''
}) => (
  <motion.div
    variants={fadeUp}
    className={`hatch flex flex-col items-center justify-center rounded-[var(--tm-radius-xl)]
      border border-dashed border-[var(--tm-primary)]/20 px-8 py-14 text-center ${className}`}
  >
    <div className="grid h-14 w-14 place-items-center rounded-[18px] bg-white text-[var(--tm-primary)] shadow-soft-sm">
      {icon || <FolderOpen className="h-6 w-6" />}
    </div>
    <h4 className="mt-4 text-[17px] font-bold text-[var(--tm-ink)]">{title}</h4>
    <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-[var(--tm-ink-soft)]">
      {description}
    </p>
    {actionLabel && onAction && (
      <Button size="sm" onClick={onAction} className="mt-5">
        {actionLabel}
      </Button>
    )}
  </motion.div>
);
