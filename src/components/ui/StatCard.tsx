import React from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
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
  /** Hatch the progress remainder (off by default: a plain thin track). */
  hatchRemainder?: boolean;
  tone?: 'primary' | 'ok' | 'warn' | 'bad' | 'neutral';
  /** A short series from data already on the page (e.g. per day); drawn as a mini chart beside the figure. */
  trend?: number[];
  trendKind?: 'bar' | 'line';
  /** Makes the whole card a link to the page behind the number (filters go in the query string). */
  to?: string;
  /** Makes the whole card a button (in-page filter, drawer). `to` wins if both are set. */
  onClick?: () => void;
  className?: string;
}

const trendColour = {
  primary: 'var(--tm-primary-dark)',
  ok: 'var(--tm-success)',
  warn: 'var(--tm-warning)',
  bad: 'var(--tm-danger)',
  neutral: 'var(--tm-neutral)'
};

/** Tiny bar or line chart. Presentation only: it draws whatever series it is given. */
export const MiniChart: React.FC<{ data: number[]; kind?: 'bar' | 'line'; color: string }> = ({ data, kind = 'bar', color }) => {
  if (data.length < 2) return null;
  const W = 72;
  const H = 24;
  const max = Math.max(...data, 1);
  if (kind === 'bar') {
    const gap = 3;
    const bw = (W - gap * (data.length - 1)) / data.length;
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden focusable="false" className="shrink-0">
        {data.map((v, i) => {
          const h = Math.max(3, (v / max) * H);
          const last = i === data.length - 1;
          return <rect key={i} x={i * (bw + gap)} y={H - h} width={bw} height={h} rx={Math.min(4, bw / 2)} fill={color} opacity={last ? 1 : 0.32} />;
        })}
      </svg>
    );
  }
  const step = W / (data.length - 1);
  const pts = data.map((v, i) => [i * step, H - 4 - (v / max) * (H - 8)] as const);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden focusable="false" className="shrink-0">
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3.5" fill={color} />
    </svg>
  );
};

const iconTones = {
  primary: 'bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]',
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

/** Compact metric tile: icon and label on one row, the figure, an optional thin progress bar, and a small muted subtitle. */
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
  trend,
  trendKind = 'bar',
  hatchRemainder = false,
  tone = 'primary',
  to,
  onClick,
  className = ''
}) => {
  const navigate = useNavigate();
  const act = to ? () => navigate(to) : onClick;
  const { reduced } = useMotionPrefs();
  const isNumeric = typeof value === 'number' && Number.isFinite(value);
  const deltaUp = (delta ?? 0) >= 0;

  return (
    <motion.div
      variants={fadeUp}
      whileHover={reduced ? undefined : { y: -3 }}
      whileTap={act && !reduced ? { scale: 0.99 } : undefined}
      transition={fastT}
      onClick={act}
      role={act ? (to ? 'link' : 'button') : undefined}
      tabIndex={act ? 0 : undefined}
      onKeyDown={
        act
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                act?.();
              }
            }
          : undefined
      }
      className={`group flex h-full min-w-0 flex-col bg-[var(--tm-card)] border border-[var(--tm-border)]/60
        rounded-[var(--tm-radius-card)] p-4 shadow-soft-xs hover:shadow-soft
        transition-shadow duration-[var(--tm-dur-fast)]
        ${act ? 'cursor-pointer hover:border-[var(--tm-accent)] focus-visible:outline-none focus-visible:shadow-glow' : ''} ${className}`}
    >
      <div className="flex items-center gap-2">
        {(icon || act) && (
          <span
            className={`relative grid h-7 w-7 shrink-0 place-items-center rounded-full [&_svg]:h-3.5 [&_svg]:w-3.5 ${iconTones[tone]}`}
          >
            <span className={act ? 'transition-opacity group-hover:opacity-0 group-focus-visible:opacity-0' : ''}>{icon}</span>
            {act && (
              <ArrowUpRight
                aria-hidden
                className="absolute opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              />
            )}
          </span>
        )}
        <span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--tm-ink-muted)]">{label}</span>
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="flex items-end gap-2.5">
          <span className="text-[28px] font-bold leading-none tracking-[-0.03em] text-[var(--tm-ink)] tabular-nums">
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
              className={`mb-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold
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
        {trend && <MiniChart data={trend} kind={trendKind} color={trendColour[tone]} />}
      </div>

      {progress !== undefined && (
        <div className="mt-2.5">
          <ProgressBar value={progress} tone={barTones[tone]} hatchRemainder={hatchRemainder} height={4} />
        </div>
      )}

      {(hint || deltaLabel) && (
        <p className="mt-1.5 text-[11.5px] font-medium leading-snug text-[var(--tm-ink-muted)]">{hint ?? deltaLabel}</p>
      )}
    </motion.div>
  );
};
