import React, { useId } from 'react';
import { motion } from 'motion/react';
import { useMotionPrefs } from './useMotionPrefs';
import { EASE_OUT } from './motion';
import { CountUp } from './CountUp';

export interface ProgressRingProps {
  /** 0–100. */
  value: number;
  size?: number;
  thickness?: number;
  /** Hatch the remaining (unfilled) part of the track. */
  hatchRemainder?: boolean;
  label?: React.ReactNode;
  sublabel?: React.ReactNode;
  tone?: 'primary' | 'ok' | 'warn' | 'bad';
  className?: string;
  showValue?: boolean;
  /** Render for a dark panel (white ring and white text). */
  onDark?: boolean;
  showTicks?: boolean;
  ticksCount?: number;
}

const toneVar = {
  primary: 'var(--tm-primary)',
  ok: 'var(--tm-success)',
  warn: 'var(--tm-warning)',
  bad: 'var(--tm-danger)'
};

/** Circular progress that sweeps up from 0 on mount. */
export const ProgressRing: React.FC<ProgressRingProps> = ({
  value,
  size = 128,
  thickness = 12,
  hatchRemainder = true,
  label,
  sublabel,
  tone = 'primary',
  className = '',
  showValue = true,
  onDark = false,
  showTicks = false,
  ticksCount = 8
}) => {
  const { reduced } = useMotionPrefs();
  const uid = useId().replace(/:/g, '');
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const strokeColor = onDark ? '#ffffff' : toneVar[tone];

  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${Math.round(pct)}%`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <pattern
            id={`ring-hatch-${uid}`}
            width="6"
            height="6"
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="6"
              stroke={strokeColor}
              strokeWidth="2"
              opacity={onDark ? 0.4 : 0.22}
            />
          </pattern>
        </defs>

        {/* Track — hatched to read as "not done yet" */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={thickness}
          stroke={
            hatchRemainder
              ? `url(#ring-hatch-${uid})`
              : onDark
                ? 'rgba(255,255,255,0.18)'
                : 'var(--tm-bg-sunken)'
          }
        />

        {/* Value */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={strokeColor}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: reduced ? offset : c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: reduced ? 0 : 0.95, ease: EASE_OUT }}
        />

        {/* Ticks around the ring */}
        {showTicks &&
          Array.from({ length: ticksCount }).map((_, i) => {
            const angle = (i * 360) / ticksCount;
            return (
              <line
                key={i}
                x1={size / 2}
                y1={size / 2 - r + thickness / 2 + 2}
                x2={size / 2}
                y2={size / 2 - r - thickness / 2 - 2}
                stroke={onDark ? 'rgba(255,255,255,0.5)' : 'var(--tm-border-strong)'}
                strokeWidth={1.5}
                strokeLinecap="round"
                transform={`rotate(${angle} ${size / 2} ${size / 2})`}
              />
            );
          })}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {showValue && (
          <span
            className={`text-[22px] font-extrabold leading-none tabular-nums ${
              onDark ? 'text-white' : 'text-[var(--tm-ink)]'
            }`}
          >
            <CountUp value={Math.round(pct)} suffix="%" />
          </span>
        )}
        {label && (
          <span
            className={`mt-1 text-[11px] font-semibold uppercase tracking-wider ${
              onDark ? 'text-white/70' : 'text-[var(--tm-ink-muted)]'
            }`}
          >
            {label}
          </span>
        )}
        {sublabel && (
          <span
            className={`text-[11px] ${onDark ? 'text-white/70' : 'text-[var(--tm-ink-muted)]'}`}
          >
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
};

export interface ProgressBarProps {
  value: number;
  tone?: 'primary' | 'ok' | 'warn' | 'bad';
  /** Hatch the remaining track. */
  hatchRemainder?: boolean;
  height?: number;
  className?: string;
}

/** Linear companion to ProgressRing — also animates from 0. */
export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  tone = 'primary',
  hatchRemainder = true,
  height = 10,
  className = ''
}) => {
  const { reduced } = useMotionPrefs();
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

  return (
    <div
      className={`w-full overflow-hidden rounded-full ${hatchRemainder ? 'hatch' : 'bg-[var(--tm-bg-sunken)]'} ${className}`}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div
        className="h-full rounded-full"
        style={{ background: toneVar[tone] }}
        initial={{ width: reduced ? `${pct}%` : 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: reduced ? 0 : 0.85, ease: EASE_OUT }}
      />
    </div>
  );
};
