import React from 'react';
import { motion } from 'motion/react';
import { fadeUp, fastT } from './motion';
import { useMotionPrefs } from './useMotionPrefs';

/** Subtle curved line pattern that sits behind hero content. */
export const CurvePattern: React.FC<{ className?: string; opacity?: number }> = ({
  className = '',
  opacity = 0.16
}) => (
  <svg
    className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    viewBox="0 0 560 240"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden
    focusable="false"
  >
    <g fill="none" stroke="currentColor" strokeOpacity={opacity} strokeWidth="1.25">
      <path d="M-60 210C60 210 120 60 260 60s200 150 360 150" />
      <path d="M-60 238C60 238 120 88 260 88s200 150 360 150" />
      <path d="M-60 182C60 182 120 32 260 32s200 150 360 150" />
      <path d="M-60 154C60 154 120 4 260 4s200 150 360 150" />
      <path d="M-60 266C60 266 120 116 260 116s200 150 360 150" />
    </g>
    <g fill="none" stroke="currentColor" strokeOpacity={opacity * 0.8} strokeWidth="1">
      <circle cx="470" cy="42" r="86" />
      <circle cx="470" cy="42" r="118" />
      <circle cx="470" cy="42" r="152" />
    </g>
  </svg>
);

export interface HeroCardProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Large right-hand figure or widget (e.g. a ProgressRing). */
  aside?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
  animate?: boolean;
}

/**
 * Charcoal feature panel with a curved line pattern and white text.
 * Used for the primary "what matters right now" block on a page.
 */
export const HeroCard: React.FC<HeroCardProps> = ({
  eyebrow,
  title,
  description,
  aside,
  actions,
  icon,
  className = '',
  children,
  animate = true
}) => {
  const { reduced } = useMotionPrefs();

  return (
    <motion.section
      variants={animate ? fadeUp : undefined}
      whileHover={reduced ? undefined : { y: -2 }}
      transition={fastT}
      className={`relative overflow-hidden rounded-[var(--tm-radius-card)] shadow-hero
        bg-[var(--tm-hero)] text-[var(--tm-on-primary)] ${className}`}
      style={{
        backgroundImage:
          'linear-gradient(135deg, var(--tm-hero-2) 0%, var(--tm-hero) 62%, var(--tm-hero) 100%)'
      }}
    >
      <CurvePattern />

      <div className="relative flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--tm-on-primary)]/12 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--tm-on-primary)]/85 backdrop-blur-sm">
              {icon}
              {eyebrow}
            </div>
          )}

          <h2 className="text-[20px] font-bold leading-[1.2] tracking-[-0.02em] sm:text-[24px]">
            {title}
          </h2>

          {description && (
            <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-[var(--tm-on-primary)]/75">
              {description}
            </p>
          )}

          {children && <div className="mt-4">{children}</div>}

          {actions && <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div>}
        </div>

        {aside && <div className="relative shrink-0">{aside}</div>}
      </div>
    </motion.section>
  );
};

export interface HeroStatProps {
  label: string;
  value: React.ReactNode;
  className?: string;
}

/** Inline figure for use inside a HeroCard's children slot. */
export const HeroStat: React.FC<HeroStatProps> = ({ label, value, className = '' }) => (
  <div className={`min-w-[80px] ${className}`}>
    <div className="text-[24px] font-bold leading-none tabular-nums">{value}</div>
    <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--tm-on-primary)]/60">
      {label}
    </div>
  </div>
);
