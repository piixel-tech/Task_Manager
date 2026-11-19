import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { useMotionPrefs } from '../../components/ui/useMotionPrefs';
import { useIsPhone } from '../../hooks/useBreakpoint';

/** Colours come from the current theme, so the burst always matches it. */
const COLORS = ['var(--tm-primary)', 'var(--tm-primary-light)', 'var(--tm-primary-dark)', 'var(--tm-warning)', 'var(--tm-success)'];

/** A festival's own symbols, picked from its name. Anything else gets a general party mix. */
const THEMES: [RegExp, string[]][] = [
  [/diwali|deepavali|dipawali/i, ['🪔', '✨', '🎆']],
  [/holi/i, ['🎨', '🌈', '✨']],
  [/christmas|xmas/i, ['🎄', '❄️', '⭐']],
  [/\beid\b|ramadan|ramzan/i, ['🌙', '⭐', '✨']],
  [/new year/i, ['🎆', '🎉', '✨']],
  [/halloween/i, ['🎃', '👻', '🦇']],
  [/navratri|dussehra|durga/i, ['🪔', '🌺', '✨']],
  [/ganesh|ganpati/i, ['🌺', '🪔', '✨']],
  [/valentine/i, ['💖', '🌹', '✨']],
  [/thanksgiving/i, ['🍂', '🦃', '✨']],
  [/independence|republic/i, ['🎆', '⭐', '🎉']]
];
export const festivalSymbols = (name = ''): string[] => THEMES.find(([re]) => re.test(name))?.[1] ?? ['✨', '🎉', '⭐'];

interface Piece {
  id: number;
  x: number; // start, % of the width
  drift: number; // sideways travel, px
  delay: number;
  duration: number;
  spin: number;
  size: number;
  color: string;
  symbol?: string;
}

/** Deterministic spread so the pieces look scattered but a re-render never reshuffles them. */
const seeded = (i: number, salt: number) => {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

/**
 * A short, light burst across the screen: confetti in the theme's colours for a personal celebration, or a festival's own symbols
 * mixed with confetti. It plays once (about three seconds), never blocks clicks, and does nothing under reduced motion.
 */
export const CelebrationBurst: React.FC<{ symbols?: string[]; onDone?: () => void }> = ({ symbols, onDone }) => {
  const { reduced } = useMotionPrefs();
  const phone = useIsPhone();
  const [alive, setAlive] = useState(true);
  const count = phone ? 22 : 40;

  const pieces = useMemo<Piece[]>(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: seeded(i, 1) * 100,
        drift: (seeded(i, 2) - 0.5) * 160,
        delay: seeded(i, 3) * 0.5,
        duration: 2.1 + seeded(i, 4) * 1.1,
        spin: (seeded(i, 5) - 0.5) * 720,
        size: 7 + seeded(i, 6) * 7,
        color: COLORS[i % COLORS.length],
        symbol: symbols && i % 3 === 0 ? symbols[(i / 3) % symbols.length | 0] : undefined
      })),
    [count, symbols]
  );

  const finished = useRef(0);
  const finish = useCallback(() => {
    setAlive(false);
    onDone?.();
  }, [onDone]);

  useEffect(() => {
    if (reduced) {
      onDone?.();
      return;
    }
    // Normally it ends when the last piece lands; this only catches a browser that never reports it.
    const t = window.setTimeout(finish, 9000);
    return () => window.clearTimeout(t);
  }, [reduced, onDone, finish]);

  if (reduced || !alive) return null;
  return createPortal(
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute top-0 block"
          style={{
            left: `${p.x}%`,
            width: p.symbol ? undefined : p.size,
            height: p.symbol ? undefined : p.size * 0.5,
            fontSize: p.symbol ? p.size * 2 : undefined,
            lineHeight: 1,
            background: p.symbol ? undefined : p.color,
            borderRadius: 2
          }}
          initial={{ y: -30, x: 0, rotate: 0, opacity: 0 }}
          animate={{ y: window.innerHeight + 40, x: p.drift, rotate: p.spin, opacity: [0, 1, 1, 0] }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn', opacity: { times: [0, 0.08, 0.8, 1] } }}
          onAnimationComplete={() => {
            finished.current += 1;
            if (finished.current >= count) finish();
          }}
        >
          {p.symbol}
        </motion.span>
      ))}
    </div>,
    document.body
  );
};

const memory = new Set<string>();

/**
 * Plays the burst once per key per day, on the first open: the key is remembered in this browser, so coming back to the dashboard
 * later the same day does not replay it. Without storage it plays once per page load. Mount it when the celebration is known.
 */
export const DailyBurst: React.FC<{ storageKey: string; symbols?: string[] }> = ({ storageKey, symbols }) => {
  const [play, setPlay] = useState(false);
  useEffect(() => {
    if (memory.has(storageKey)) return;
    memory.add(storageKey);
    try {
      if (localStorage.getItem(storageKey)) return;
      localStorage.setItem(storageKey, '1');
    } catch {
      /* storage unavailable: it still plays once for this visit */
    }
    setPlay(true);
  }, [storageKey]);
  return play ? <CelebrationBurst symbols={symbols} onDone={() => setPlay(false)} /> : null;
};
