import { useReducedMotion } from 'motion/react';

/**
 * One hook for every "should this animate?" question.
 *
 * `reduced` is true when the OS requests reduced motion; callers either skip
 * the animation entirely or hand `instant` to a transition so the value still
 * lands on its final state without travelling there.
 */
export function useMotionPrefs() {
  const reduced = !!useReducedMotion();
  return {
    reduced,
    /** Duration in seconds, collapsed to ~0 under reduced motion. */
    d: (seconds: number) => (reduced ? 0 : seconds),
    /** Spread into a motion component to disable transforms wholesale. */
    instant: reduced ? { duration: 0 } : undefined
  };
}
