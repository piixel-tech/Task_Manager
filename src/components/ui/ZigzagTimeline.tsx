import React from 'react';
import { motion } from 'motion/react';
import { useMotionPrefs } from './useMotionPrefs';
import { EASE_OUT } from './motion';

export interface ZigzagTimelineProps<T> {
  items: T[];
  getKey: (item: T) => string;
  /** The card itself. It draws its own pin, number and hover; the timeline only places it and joins it to the next one. */
  render: (item: T, index: number) => React.ReactNode;
  label: string;
}

/** Dashed, curved line from the bottom of one card to the top of the next (desktop), or a straight dashed line (phones). */
const Connector: React.FC<{ fromLeft: boolean }> = ({ fromLeft }) => (
  <div aria-hidden className="h-10 md:h-16">
    <div className="mx-auto h-full w-0 border-l-2 border-dashed border-[var(--tm-border-strong)] md:hidden" />
    <svg className="hidden h-full w-full md:block" viewBox="0 0 100 60" preserveAspectRatio="none">
      <path
        d={fromLeft ? 'M25 0 C25 38, 75 22, 75 60' : 'M75 0 C75 38, 25 22, 25 60'}
        fill="none"
        stroke="var(--tm-border-strong)"
        strokeWidth={2}
        strokeDasharray="6 7"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  </div>
);

/**
 * Items on a zigzag: cards alternate left and right of the middle, joined by dashed curves. Each card fades and floats in
 * as it scrolls into view. On phones it is one column. Reduced motion: cards are simply there.
 */
export function ZigzagTimeline<T>({ items, getKey, render, label }: ZigzagTimelineProps<T>) {
  const { reduced } = useMotionPrefs();
  // Without IntersectionObserver (very old browsers, tests) cards are simply shown.
  const reveal = !reduced && typeof IntersectionObserver !== 'undefined';
  return (
    <ol aria-label={label} className="m-0 list-none p-0 pt-3">
      {items.map((item, i) => {
        const left = i % 2 === 0;
        return (
          <li key={getKey(item)}>
            <div className="md:grid md:grid-cols-2">
              <motion.div
                className={`mx-auto w-full max-w-[420px] ${left ? 'md:col-start-1' : 'md:col-start-2'}`}
                initial={reveal ? { opacity: 0, y: 28 } : false}
                whileInView={reveal ? { opacity: 1, y: 0 } : undefined}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.55, ease: EASE_OUT }}
              >
                {render(item, i)}
              </motion.div>
            </div>
            {i < items.length - 1 && <Connector fromLeft={left} />}
          </li>
        );
      })}
    </ol>
  );
}
