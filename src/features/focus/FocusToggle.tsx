import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Moon } from 'lucide-react';
import { useMotionPrefs } from '../../components/ui/useMotionPrefs';

/** Where the stars sit inside the pill (percent from the left / top) and when they start twinkling. */
const STARS = [
  { x: 14, y: 26, d: 0, s: 3 },
  { x: 30, y: 68, d: 0.7, s: 2 },
  { x: 44, y: 30, d: 1.3, s: 2 },
  { x: 55, y: 74, d: 0.4, s: 3 },
  { x: 68, y: 22, d: 1.9, s: 2 },
  { x: 80, y: 60, d: 1.1, s: 2 }
];

/**
 * The look of the Focus mode switch: a dark pill with a moon on a knob. Switched on, the knob slides across, the moon
 * glows and tiny stars twinkle; switched off, it all runs back. Presentation only: the button around it decides what a
 * click does. Reduced motion: it changes state instantly and the stars hold still.
 */
export const FocusPill: React.FC<{ on: boolean }> = ({ on }) => (
  <span
    aria-hidden
    data-on={on}
    className="relative block h-10 w-[76px] overflow-hidden rounded-full border border-[color-mix(in_srgb,var(--tm-on-dark)_14%,transparent)]
      bg-[var(--tm-hero)] shadow-soft-xs transition-shadow duration-500 data-[on=true]:shadow-[0_0_22px_-2px_color-mix(in_srgb,var(--tm-accent)_65%,transparent)]"
  >
    {STARS.map((s, i) => (
      <i
        key={i}
        className={`absolute rounded-full bg-[var(--tm-on-dark)] transition-opacity duration-500 ${on ? 'tm-twinkle opacity-100' : 'opacity-0'}`}
        style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, animationDelay: `${s.d}s` }}
      />
    ))}
    <span
      className={`absolute left-1 top-1 grid h-8 w-8 place-items-center rounded-full transition-[transform,background-color,box-shadow,color]
        duration-500 ease-[cubic-bezier(0.34,1.4,0.64,1)] ${
          on
            ? 'translate-x-9 bg-[var(--tm-accent)] text-[var(--tm-accent-ink)] shadow-[0_0_16px_4px_color-mix(in_srgb,var(--tm-accent)_70%,transparent)]'
            : 'translate-x-0 bg-[color-mix(in_srgb,var(--tm-on-dark)_22%,transparent)] text-[var(--tm-on-dark)]'
        }`}
    >
      <Moon className={`h-4 w-4 transition-all duration-500 ${on ? 'fill-current' : ''}`} />
    </span>
  </span>
);

/** The soft light that spreads down from the switch while Focus mode is on. Sits inside the switch's wrapper. */
export const FocusBeam: React.FC<{ on: boolean }> = ({ on }) => {
  const { reduced } = useMotionPrefs();
  return (
    <AnimatePresence>
      {on && (
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-[calc(100%-6px)] z-0 w-[280px] -translate-x-1/2">
          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, scaleY: 0.15, scaleX: 0.5 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, scaleY: 1, scaleX: 1 }}
            exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scaleY: 0.15, scaleX: 0.5, transition: { duration: 0.45, ease: [0.4, 0, 0.2, 1] } }}
            transition={{ duration: reduced ? 0 : 0.7, ease: [0.16, 1, 0.3, 1] }}
            style={{
              height: 380,
              transformOrigin: '50% 0%',
              clipPath: 'polygon(40% 0, 60% 0, 100% 100%, 0 100%)',
              background: 'linear-gradient(to bottom, color-mix(in srgb, var(--tm-accent) 46%, transparent), transparent 88%)',
              filter: 'blur(12px)'
            }}
          />
        </div>
      )}
    </AnimatePresence>
  );
};
