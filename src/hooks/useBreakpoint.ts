import { useEffect, useState } from 'react';

/**
 * The shared screen sizes. They match Tailwind's `md` (768px) and `lg` (1024px), so a class like `max-md:hidden` and this hook
 * always agree. Phone: under 768px. Tablet: 768-1023px. Desktop: 1024px and up.
 */
export const PHONE_MAX = 767;
export const TABLET_MAX = 1023;
export type Breakpoint = 'phone' | 'tablet' | 'desktop';

const query = (max: number) => `(max-width: ${max}px)`;
const read = (): Breakpoint => {
  if (typeof window === 'undefined' || !window.matchMedia) return 'desktop';
  if (window.matchMedia(query(PHONE_MAX)).matches) return 'phone';
  return window.matchMedia(query(TABLET_MAX)).matches ? 'tablet' : 'desktop';
};

/** Which size class the window is in right now; updates when it is resized or rotated. */
export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(read);
  useEffect(() => {
    if (!window.matchMedia) return;
    const lists = [window.matchMedia(query(PHONE_MAX)), window.matchMedia(query(TABLET_MAX))];
    const on = () => setBp(read());
    lists.forEach((l) => l.addEventListener('change', on));
    on();
    return () => lists.forEach((l) => l.removeEventListener('change', on));
  }, []);
  return bp;
}

export const useIsPhone = () => useBreakpoint() === 'phone';
