import React, { useEffect } from 'react';
import { useFocusStore, isActive } from '../../store/useFocusStore';
import { useMotionPrefs } from '../../components/ui/useMotionPrefs';

/**
 * The look-only effects of the app shell:
 *  - Focus mode: sets <html data-focus="on"> while my Focus mode is on; the veil (effects.css) grays and dims everything
 *    except the element marked data-focus-keep (the open task), with a smooth transition both ways.
 *  - Living background: soft drifting colour blobs behind the glass; off for Reduce motion, paused while the tab is hidden.
 */
export const AmbientEffects: React.FC = () => {
  const mine = useFocusStore((s) => s.mine);
  const now = useFocusStore((s) => s.now);
  const { reduced } = useMotionPrefs();
  const focused = isActive(mine, now);

  useEffect(() => {
    const root = document.documentElement;
    if (focused) root.setAttribute('data-focus', 'on');
    else root.removeAttribute('data-focus');
    return () => root.removeAttribute('data-focus');
  }, [focused]);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => (document.hidden ? root.setAttribute('data-tab-hidden', '') : root.removeAttribute('data-tab-hidden'));
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      root.removeAttribute('data-tab-hidden');
    };
  }, []);

  return (
    <>
      {!reduced && (
        <div className="tm-living-bg" aria-hidden>
          <i />
          <i />
          <i />
        </div>
      )}
      <div className="tm-focus-veil" aria-hidden />
    </>
  );
};
