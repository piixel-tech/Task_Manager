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
  /** `compact` for a list or column inside a card; the default fills a page. */
  size?: 'page' | 'compact';
}

/** Hatched panel for "nothing here yet" — the empty-value texture. */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
  size = 'page'
}) =>
  size === 'compact' ? (
    <div
      className={`flex flex-col items-center justify-center rounded-[var(--tm-radius-md)] border border-dashed border-[var(--tm-border-strong)] bg-[var(--tm-card)] px-5 py-7 text-center ${className}`}
    >
      <div className="grid h-10 w-10 place-items-center rounded-full bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)] [&_svg]:h-[18px] [&_svg]:w-[18px]">
        {icon || <FolderOpen />}
      </div>
      <h4 className="mt-3 text-[14px] font-bold text-[var(--tm-ink)]">{title}</h4>
      <p className="mt-1 max-w-xs text-[12.5px] leading-relaxed text-[var(--tm-ink-soft)]">{description}</p>
      {actionLabel && onAction && (
        <Button size="sm" onClick={onAction} className="mt-4">
          {actionLabel}
        </Button>
      )}
    </div>
  ) : (
  <motion.div
    variants={fadeUp}
    className={`flex flex-col items-center justify-center rounded-[var(--tm-radius-card)]
      border border-dashed border-[var(--tm-border-strong)] bg-[var(--tm-card)] px-8 py-14 text-center shadow-soft-xs ${className}`}
  >
    <div className="grid h-14 w-14 place-items-center rounded-full bg-[var(--tm-solid)] text-[var(--tm-solid-accent)] shadow-soft-sm">
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
