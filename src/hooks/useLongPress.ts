import { useRef } from 'react';

/**
 * Touch screens only: hold a finger on something for half a second to open its action menu (the same one the desktop gets from a
 * button or a right-click). Moving the finger cancels it, and the tap that ends a long press is swallowed so it does not also open the item.
 * Spread the result on the element; mouse input is not touched, so desktop behaves exactly as before.
 */
export function useLongPress(onLongPress: () => void, ms = 500) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const start = useRef({ x: 0, y: 0 });
  const fired = useRef(false);
  const cancel = () => clearTimeout(timer.current);

  return {
    onTouchStart: (e: React.TouchEvent) => {
      fired.current = false;
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
      cancel();
      timer.current = setTimeout(() => {
        fired.current = true;
        navigator.vibrate?.(10);
        onLongPress();
      }, ms);
    },
    onTouchMove: (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (Math.hypot(t.clientX - start.current.x, t.clientY - start.current.y) > 10) cancel();
    },
    onTouchEnd: cancel,
    onTouchCancel: cancel,
    /** The tap that follows a long press must not also activate the item. */
    onClickCapture: (e: React.MouseEvent) => {
      if (fired.current) {
        fired.current = false;
        e.preventDefault();
        e.stopPropagation();
      }
    },
    onContextMenu: (e: React.MouseEvent) => {
      // Mobile browsers send a context menu on a long press; ours replaces it. A mouse right-click is left alone.
      if (fired.current || (e.nativeEvent as PointerEvent).pointerType === 'touch') e.preventDefault();
    }
  };
}
