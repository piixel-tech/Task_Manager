import { useEffect, useState } from 'react';

/**
 * The part of the screen that is really visible. When the phone keyboard opens, the visual viewport gets shorter, so a full-screen
 * panel sized to it keeps its bottom edge (the message box) just above the keys.
 */
export function useKeyboardViewport(enabled: boolean): { height: number; top: number } | null {
  const [vp, setVp] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    const v = window.visualViewport;
    if (!enabled || !v) {
      setVp(null);
      return;
    }
    const update = () => setVp({ height: v.height, top: v.offsetTop });
    update();
    v.addEventListener('resize', update);
    v.addEventListener('scroll', update);
    return () => {
      v.removeEventListener('resize', update);
      v.removeEventListener('scroll', update);
    };
  }, [enabled]);
  return vp;
}
