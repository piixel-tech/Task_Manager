import React from 'react';
import { motion } from 'motion/react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { fadeUp, fastT } from './motion';
import { useMotionPrefs } from './useMotionPrefs';
import { CountUp } from './CountUp';
import { ProgressBar } from './ProgressRing';

export interface StatCardProps {
  label: string;
  value: number | string;
  /** Rendered after an animated number, e.g. "h" or "%". */
  suffix?: string;
  prefix?: string;
  decimals?: number;
  icon?: React.ReactNode;
  hint?: React.ReactNode;
  /** Percentage change; sign picks the arrow and colour. */
  delta?: number;
  deltaLabel?: string;
  /** Show a progress track under the figure (0–100). */
  progress?: number;
  /** Hatch the progress remainder — reads as "still to go". */
  hatchRemainder?: boolean;
  tone?: 'primary' | 'ok' | 'warn' | 'bad' | 'neutral';
  onClick?: () => void;
  className?: string;
}

const iconTones = {
  primary: 'bg-[var(--tm-primary-soft)] text-[var(--tm-primary)]',
  ok: 'bg-[var(--tm-success-bg)] text-[var(--tm-success)]',
  warn: 'bg-[var(--tm-warning-bg)] text-[var(--tm-warning)]',
  bad: 'bg-[var(--tm-danger-bg)] text-[var(--tm-danger)]',
  neutral: 'bg-[var(--tm-neutral-bg)] text-[var(--tm-neutral)]'
};

const barTones = {
  primary: 'primary',
  ok: 'ok',
  warn: 'warn',
  bad: 'bad',
  neutral: 'primary'
} as const;

/** White metric tile: label, animated figure, optional delta and progress. */
export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  suffix,
  prefix,
  decimals = 0,
  icon,
  hint,
  delta,
  deltaLabel,
  progress,
  hatchRemainder = true,
  tone = 'primary',
  onClick,
  className = ''
}) => {
  const { reduced } = useMotionPrefs();
  const isNumeric = typeof value === 'number' && Number.isFinite(value);
  const deltaUp = (delta ?? 0) >= 0;

  return (
    <motion.div
      variants={fadeUp}
      whileHover={reduced ? undefined : { y: -3 }}
      whileTap={onClick && !reduced ? { scale: 0.99 } : undefined}
      transition={fastT}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`group bg-[var(--tm-card)] border border-[var(--tm-border)]
        rounded-[var(--tm-radius-xl)] p-6 shadow-soft-xs hover:shadow-soft
        transition-shadow duration-[var(--tm-dur-fast)]
        ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--tm-ink-muted)]">
          {label}
        </span>
        {icon && (
          <span
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-[14px] ${iconTones[tone]}`}
          >
            {icon}
          </span>
        )}
      </div>

      <div className="mt-4 flex items-end gap-2.5">
        <span className="text-[32px] font-extrabold leading-none tracking-[-0.03em] text-[var(--tm-ink)] tabular-nums">
          {isNumeric ? (
            <CountUp value={value as number} decimals={decimals} prefix={prefix} suffix={suffix} />
          ) : (
            <>
              {prefix}
              {value}
              {suffix}
            </>
          )}
        </span>

        {delta !== undefined && (
          <span
            className={`mb-1 inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-[11px] font-bold
              ${
                deltaUp
                  ? 'bg-[var(--tm-success-bg)] text-[var(--tm-success)]'
                  : 'bg-[var(--tm-danger-bg)] text-[var(--tm-danger)]'
              }`}
          >
            {deltaUp ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {Math.abs(delta)}%
          </span>
        )}
      </div>

      {progress !== undefined && (
        <div className="mt-5">
          <ProgressBar value={progress} tone={barTones[tone]} hatchRemainder={hatchRemainder} height={8} />
        </div>
      )}

      {(hint || deltaLabel) && (
        <p className="mt-3 text-[12px] leading-relaxed text-[var(--tm-ink-muted)]">
          {hint ?? deltaLabel}
        </p>
      )}
    </motion.div>
  );
};
