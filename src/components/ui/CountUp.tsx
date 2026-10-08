import React, { useEffect, useRef, useState } from 'react';
import { animate } from 'motion/react';
import { useMotionPrefs } from './useMotionPrefs';
import { EASE_OUT } from './motion';

export interface CountUpProps {
  value: number;
  /** Decimal places to render. */
  decimals?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  /** Insert thousands separators. */
  separator?: boolean;
}

/** Animates a number from its previous value up to `value`. */
export const CountUp: React.FC<CountUpProps> = ({
  value,
  decimals = 0,
  duration = 0.9,
  prefix = '',
  suffix = '',
  className = '',
  separator = true
}) => {
  const { reduced } = useMotionPrefs();
  const [display, setDisplay] = useState(reduced ? value : 0);
  const from = useRef(reduced ? value : 0);

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      from.current = value;
      return;
    }
    const controls = animate(from.current, value, {
      duration,
      ease: EASE_OUT,
      onUpdate: (v) => setDisplay(v),
      onComplete: () => {
        from.current = value;
      }
    });
    return () => controls.stop();
  }, [value, duration, reduced]);

  const formatted = display.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: separator
  });

  return (
    <span className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
};
