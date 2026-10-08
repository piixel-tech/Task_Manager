import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, type Variants } from 'motion/react';
import { EASE_OUT } from '../ui/motion';
import { useMotionPrefs } from '../ui/useMotionPrefs';

/**
 * Module-level constants on purpose: a fresh variants object on every render
 * restarts the in-flight animation.
 */
const pageVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.28,
      ease: EASE_OUT,
      staggerChildren: 0.055,
      delayChildren: 0.04
    }
  }
};

const reducedVariants: Variants = {
  hidden: { opacity: 1, y: 0 },
  show: { opacity: 1, y: 0, transition: { duration: 0 } }
};

/**
 * Fades/slides each route in and acts as the stagger parent for the page.
 *
 * Changing `key` on navigation remounts the subtree, so the new page always
 * plays its entrance from `hidden`. There is deliberately no `AnimatePresence`
 * here: `<Outlet/>` renders the *current* route, so an outgoing child would
 * already be showing the incoming page's markup — and a wait-mode exit that
 * stalls leaves the whole page invisible.
 *
 * Variant propagation is context-based, so any `motion` descendant declaring
 * the shared `hidden` / `show` variants (Card, StatCard, HeroCard, PageHeader,
 * StaggerItem…) fades up in sequence without extra wiring.
 */
export const RouteTransition: React.FC<{ className?: string }> = ({ className = '' }) => {
  const location = useLocation();
  const { reduced } = useMotionPrefs();

  return (
    <motion.div
      key={location.pathname}
      variants={reduced ? reducedVariants : pageVariants}
      initial="hidden"
      animate="show"
      className={className}
    >
      <Outlet />
    </motion.div>
  );
};
