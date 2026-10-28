import React, { useEffect, useRef, useState } from 'react';
import { Moon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { toast } from '../../store/useToastStore';
import { focusEndLabel, isActive, useFocusStore } from '../../store/useFocusStore';
import { focusApi } from '../../services/http/focusApi';

const LENGTHS = [
  { label: '30 minutes', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 }
];

/** Tomorrow at 9:00 in the browser's time zone. */
function tomorrowNine(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

/** The Focus controls: how long to go quiet, or end it. Used in the top bar's popover and in Settings. */
export const FocusControls: React.FC<{ onDone?: () => void }> = ({ onDone }) => {
  const mine = useFocusStore((s) => s.mine);
  const [custom, setCustom] = useState(false);
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);
  const until = isActive(mine) ? mine : null;

  const run = async (fn: () => Promise<string | null>, title: string, message: (until: string | null) => string | undefined) => {
    setBusy(true);
    try {
      const end = await fn();
      useFocusStore.getState().setMine(isActive(end) ? end : null);
      toast.success(title, message(end));
      setCustom(false);
      onDone?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change Focus mode');
    } finally {
      setBusy(false);
    }
  };

  const start = (body: { minutes: number } | { until: string }) =>
    run(
      () => focusApi.start(body),
      'Focus mode on',
      (end) => (end ? `Quiet until ${focusEndLabel(end)}. Notifications still wait in your bell.` : undefined)
    );

  const picked = when ? new Date(when) : null;
  const validCustom = !!picked && picked.getTime() > Date.now() + 60_000;

  return (
    <div>
      {until ? (
        <>
          <p className="text-[13px] text-[var(--tm-ink-soft)]">You are in focus until {focusEndLabel(until)}. No popups or badges; notifications wait in your bell.</p>
          <Button className="mt-3 w-full" variant="outline" isLoading={busy} onClick={() => run(() => focusApi.end(), 'Focus mode off', () => 'Welcome back.')}>
            End focus now
          </Button>
        </>
      ) : (
        <p className="text-[13px] text-[var(--tm-ink-soft)]">Go quiet: no popups, sounds or badge changes. Colleagues see a 🌙 on your avatar.</p>
      )}

      <div className="mt-3 space-y-1.5">
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-[var(--tm-ink-muted)]">{until ? 'Change to' : 'For'}</p>
        {LENGTHS.map((l) => (
          <MenuButton key={l.minutes} disabled={busy} onClick={() => start({ minutes: l.minutes })}>
            {l.label}
          </MenuButton>
        ))}
        <MenuButton disabled={busy} onClick={() => start({ until: tomorrowNine().toISOString() })}>
          Until tomorrow 9:00 AM
        </MenuButton>
        <MenuButton
          disabled={busy}
          onClick={() => {
            setCustom((c) => !c);
            setWhen(toLocalInput(new Date(Date.now() + 3 * 3_600_000)));
          }}
        >
          Custom…
        </MenuButton>
        {custom && (
          <div className="space-y-2 pt-1">
            <Input label="Until" type="datetime-local" value={when} min={toLocalInput(new Date())} onChange={(e) => setWhen(e.target.value)} />
            <Button size="sm" className="w-full" disabled={!validCustom} isLoading={busy} onClick={() => picked && start({ until: picked.toISOString() })}>
              Start focus
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

/** Moon button in the top bar: go quiet for a while. Others see a moon on your avatar until it ends. */
export const FocusMenu: React.FC = () => {
  const mine = useFocusStore((s) => s.mine);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const until = isActive(mine) ? mine : null;

  useEffect(() => {
    const onDown = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={until ? `Focus mode on until ${focusEndLabel(until)}` : 'Focus mode'}
        aria-expanded={open}
        title={until ? `In focus until ${focusEndLabel(until)}` : 'Focus mode'}
        className={`grid h-10 w-10 place-items-center rounded-full border transition-colors ${
          until
            ? 'border-[var(--tm-primary)] bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]'
            : 'border-[var(--tm-border)] bg-[var(--tm-card)] text-[var(--tm-ink-soft)] hover:border-[var(--tm-border-strong)] hover:text-[var(--tm-ink)]'
        }`}
      >
        <Moon className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Focus mode"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-72 rounded-[var(--tm-radius-lg)] border border-[var(--tm-border)] bg-[var(--tm-card)] p-4 shadow-soft-lg"
        >
          <h3 className="mb-2 flex items-center gap-2 text-[14px] font-extrabold text-[var(--tm-ink)]">
            <Moon className="h-4 w-4" /> Focus mode
          </h3>
          <FocusControls onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
};

const MenuButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, ...rest }) => (
  <button
    type="button"
    className="flex w-full items-center rounded-xl px-3 py-2 text-left text-[13px] font-semibold text-[var(--tm-ink)] hover:bg-[var(--tm-bg-sunken)] disabled:opacity-50"
    {...rest}
  >
    {children}
  </button>
);
