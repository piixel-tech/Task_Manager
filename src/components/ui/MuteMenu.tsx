import React, { useEffect, useRef, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { isMutedKey, useMutesStore, type MuteDuration } from '../../store/useMutesStore';

const OPTIONS: { id: MuteDuration; label: string }[] = [
  { id: '8h', label: 'Mute for 8 hours' },
  { id: '1w', label: 'Mute for 1 week' },
  { id: 'always', label: 'Mute always' }
];

/** Bell button that mutes a chat (`chat:<id>`) or subfolder (`subfolder:<id>`). Mentions and approvals still come through. */
export const MuteMenu: React.FC<{ mutedKey: string; className?: string }> = ({ mutedKey, className = '' }) => {
  const mutes = useMutesStore((s) => s.mutes);
  const setMute = useMutesStore((s) => s.set);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const muted = isMutedKey(mutes, mutedKey);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const until = mutes[mutedKey];
  const note = !muted
    ? null
    : until === 'always'
      ? 'Muted'
      : `Muted until ${new Date(until).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;

  const choose = (duration: MuteDuration) => {
    void setMute(mutedKey, duration);
    setOpen(false);
  };
  const item = 'block w-full rounded-[var(--tm-radius-sm)] px-3 py-2 text-left text-[13px] font-semibold text-[var(--tm-ink)] hover:bg-[var(--tm-bg-sunken)]';

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        aria-label={muted ? 'Notifications muted' : 'Mute notifications'}
        title={note ?? 'Mute notifications'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid h-9 w-9 place-items-center rounded-full text-[var(--tm-ink-soft)] hover:bg-[var(--tm-bg-sunken)]"
      >
        {muted ? <BellOff className="h-5 w-5 text-[var(--tm-primary-dark)]" /> : <Bell className="h-5 w-5" />}
      </button>
      {open && (
        <div role="menu" className="glass-strong absolute right-0 top-[calc(100%+6px)] z-50 w-52 rounded-[var(--tm-radius-md)] p-1.5">
          {note && <p className="px-3 py-1.5 text-[11.5px] font-semibold text-[var(--tm-ink-muted)]">{note}</p>}
          {OPTIONS.map((o) => (
            <button key={o.id} role="menuitem" type="button" onClick={() => choose(o.id)} className={item}>
              {o.label}
            </button>
          ))}
          {muted && (
            <button role="menuitem" type="button" onClick={() => choose('off')} className={`${item} !font-bold !text-[var(--tm-primary-dark)]`}>
              Unmute
            </button>
          )}
        </div>
      )}
    </div>
  );
};
