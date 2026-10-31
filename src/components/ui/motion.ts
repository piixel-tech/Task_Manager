import type { Transition, Variants } from 'motion/react';

/**
 * Shared motion language: quick and soft — 200–350ms, ease-out.
 * Everything here degrades to an instant cut when the OS asks for
 * reduced motion (see `useMotion` and the global CSS override).
 */

export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export const dur = {
  fast: 0.2,
  base: 0.26,
  slow: 0.34
} as const;

export const spring: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 34,
  mass: 0.7
};

export const softT: Transition = { duration: dur.base, ease: EASE_OUT };
export const fastT: Transition = { duration: dur.fast, ease: EASE_OUT };

/** Container that staggers its children into view. */
export const staggerParent = (stagger = 0.055, delay = 0.02): Variants => ({
  hidden: {},
  show: {
    transition: { staggerChildren: stagger, delayChildren: delay }
  }
});

/** The card / tile fade-up used across every page load. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: softT }
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: softT }
};

/** Route transition — fade with a short slide. */
export const routeVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: dur.base, ease: EASE_OUT } },
  exit: { opacity: 0, y: -6, transition: { duration: dur.fast, ease: EASE_OUT } }
};

/** Modal / dialog spring pop-in behind a blurred backdrop. */
export const modalVariants: Variants = {
  hidden: { opacity: 0, scale: 0.92, y: 16 },
  show: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 380, damping: 28, mass: 0.8 } },
  exit: { opacity: 0, scale: 0.97, y: 6, transition: { duration: dur.fast, ease: EASE_OUT } }
};

export const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: fastT },
  exit: { opacity: 0, transition: fastT }
};

/** Right-side drawer. */
export const drawerVariants: Variants = {
  hidden: { x: '100%' },
  show: { x: 0, transition: { duration: dur.slow, ease: EASE_OUT } },
  exit: { x: '100%', transition: { duration: dur.base, ease: EASE_OUT } }
};

/** Dropdowns and popovers (account menu, bell): a quick spring pop from their anchor. */
export const popoverVariants: Variants = {
  hidden: { opacity: 0, y: -10, scale: 0.94 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 460, damping: 30, mass: 0.7 } },
  exit: { opacity: 0, y: -6, scale: 0.97, transition: { duration: dur.fast, ease: EASE_OUT } }
};

/** Toasts slide in from the right edge. */
export const toastVariants: Variants = {
  hidden: { opacity: 0, x: 40, scale: 0.94 },
  show: { opacity: 1, x: 0, scale: 1, transition: { type: 'spring', stiffness: 420, damping: 30, mass: 0.8 } },
  exit: { opacity: 0, x: 40, scale: 0.96, transition: { duration: dur.fast, ease: EASE_OUT } }
};

/** Press + hover feedback shared by buttons and cards. */
export const pressable = {
  whileTap: { scale: 0.97 },
  transition: fastT
} as const;

export const liftOnHover = {
  whileHover: { y: -3 },
  transition: fastT
} as const;

/** Item entering/leaving a filtered or reordered list. */
export const listItemVariants: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: softT },
  exit: { opacity: 0, scale: 0.97, transition: fastT }
};
