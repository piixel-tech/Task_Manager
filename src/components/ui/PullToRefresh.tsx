import React, { useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

const THRESHOLD = 64;

/**
 * Touch screens only: pull a scrolling list down from its top to reload it. It is the list's own scroll box (give it the height and
 * overflow classes); on desktop it is a plain div. The reload must return a promise so the spinner knows when to go away.
 */
export const PullToRefresh: React.FC<{ onRefresh: () => Promise<unknown> | void; className?: string; children: React.ReactNode }> = ({ onRefresh, className = '', children }) => {
  const box = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);

  const end = async () => {
    const go = pull >= THRESHOLD && !busy;
    startY.current = null;
    setPull(0);
    if (!go) return;
    setBusy(true);
    try {
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      ref={box}
      className={className}
      onTouchStart={(e) => {
        startY.current = (box.current?.scrollTop ?? 0) <= 0 ? e.touches[0].clientY : null;
      }}
      onTouchMove={(e) => {
        if (startY.current === null) return;
        const dy = e.touches[0].clientY - startY.current;
        if (dy > 0 && (box.current?.scrollTop ?? 0) <= 0) setPull(Math.min(dy * 0.5, THRESHOLD * 1.5));
        else if (dy <= 0) setPull(0);
      }}
      onTouchEnd={() => void end()}
      onTouchCancel={() => {
        startY.current = null;
        setPull(0);
      }}
    >
      {(pull > 0 || busy) && (
        <div className="flex h-9 items-center justify-center text-[var(--tm-ink-muted)] md:hidden" style={{ marginTop: busy ? 0 : Math.max(0, pull - 36) }} role="status" aria-label={busy ? 'Refreshing' : 'Pull to refresh'}>
          <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} style={{ transform: busy ? undefined : `rotate(${pull * 4}deg)`, opacity: Math.min(1, pull / THRESHOLD) }} />
        </div>
      )}
      {children}
    </div>
  );
};
