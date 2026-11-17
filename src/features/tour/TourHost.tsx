import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useAuthStore } from '../../store/authStore';
import { useDailyStatusStore } from '../../store/useDailyStatusStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useTourStore } from '../../store/useTourStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { dayOffOn, ymdOf } from '../workspace/dayOff';
import { tourFor, tourIdFor } from './tourSteps';

const PAD = 6;
const CARD_W = 340;
const GAP = 14;
const EDGE = 12;

/** The first of the matches that is actually on screen (the same link can be in the top bar and in a phone drawer). */
export const visibleTarget = (selector: string): HTMLElement | null =>
  (Array.from(document.querySelectorAll(selector)) as HTMLElement[]).find((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }) ?? null;

interface Place {
  rect: { left: number; top: number; width: number; height: number } | null;
  card: { left: number; top: number };
}

const placeFor = (target: HTMLElement | null, cardH: number): Place => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!target) return { rect: null, card: { left: (vw - CARD_W) / 2, top: Math.max(EDGE, (vh - cardH) / 2) } };
  const r = target.getBoundingClientRect();
  const rect = { left: r.left - PAD, top: r.top - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
  let left: number;
  let top: number;
  if (r.height > r.width * 2 && r.right + GAP + CARD_W < vw - EDGE) {
    // a tall thing on the side (the left rail): the card goes beside it
    left = r.right + PAD + GAP;
    top = Math.min(Math.max(EDGE, r.top), vh - cardH - EDGE);
  } else {
    left = Math.min(Math.max(EDGE, r.left + r.width / 2 - CARD_W / 2), vw - CARD_W - EDGE);
    top = r.bottom + PAD + GAP + cardH < vh - EDGE ? r.bottom + PAD + GAP : Math.max(EDGE, r.top - PAD - GAP - cardH);
  }
  return { rect, card: { left, top } };
};

/**
 * The first-login tour, and "Replay the tour" from Help. It dims the screen, rings the part being explained and shows a small card
 * with Back, Next and Skip. It starts once for each person (after they have answered the daily status, so the two never overlap)
 * and is remembered on the account, separately for the admin and the employee tour.
 */
export const TourHost: React.FC = () => {
  const role = useAuthStore((s) => s.user?.role);
  const saved = useAuthStore((s) => s.user?.settings);
  const companyId = useAuthStore((s) => s.user?.companyId);
  const { open, step, start, go, close } = useTourStore();
  const { today, mineLoaded } = useDailyStatusStore();
  const workspace = useWorkspaceStore((s) => s.workspace);

  const steps = tourFor(role);
  const tourId = tourIdFor(role);
  const offToday = !!dayOffOn(workspace, ymdOf(new Date()), companyId);

  // First login: start once, when their status for today is settled.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !steps || !tourId || !saved) return;
    if (saved.tour === tourId) return;
    if (!mineLoaded || (today?.status == null && !offToday)) return;
    started.current = true;
    start();
  }, [steps, tourId, saved, mineLoaded, today?.status, offToday, start]);

  const finish = () => {
    close();
    if (tourId && useSettingsStore.getState().settings.tour !== tourId) void useSettingsStore.getState().update({ tour: tourId });
  };

  const current = steps?.[step];
  const card = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<Place | null>(null);

  // Find the thing being explained, and keep the ring on it while the page moves or resizes.
  useEffect(() => {
    if (!open || !current) return;
    const target = visibleTarget(current.target);
    target?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    const update = () => setPlace(placeFor(visibleTarget(current.target), card.current?.offsetHeight ?? 190));
    update();
    const t = window.setInterval(update, 400);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, current]);

  useEffect(() => {
    if (open) card.current?.querySelector<HTMLElement>('[data-tour-next]')?.focus();
  }, [open, step]);

  useEffect(() => {
    if (!open || !steps) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        finish();
      } else if (e.key === 'ArrowRight') step < steps.length - 1 ? go(step + 1) : finish();
      else if (e.key === 'ArrowLeft') go(step - 1);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, steps]);

  if (!open || !steps || !current) return null;
  const last = step === steps.length - 1;
  const p = place ?? placeFor(null, 190);

  return createPortal(
    <div className="fixed inset-0 z-[140]" role="dialog" aria-modal="true" aria-label="Quick tour">
      {/* Blocks clicks on the page behind. With a ring the dimming comes from its shadow, without one from this layer. */}
      <div className={`absolute inset-0 ${p.rect ? '' : 'bg-[var(--tm-ink)]/55 backdrop-blur-[1px]'}`} />
      {p.rect && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-[20px] ring-2 ring-[var(--tm-card)] transition-all duration-200"
          style={{ ...p.rect, boxShadow: '0 0 0 9999px color-mix(in srgb, var(--tm-ink) 55%, transparent)' }}
        />
      )}
      <div
        ref={card}
        style={{ left: p.card.left, top: p.card.top, width: CARD_W, maxWidth: 'calc(100vw - 24px)' }}
        className="absolute rounded-[var(--tm-radius-card)] border border-[var(--tm-border)] bg-[var(--tm-card)] p-5 shadow-soft-lg"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--tm-primary-dark)]">
              Step {step + 1} of {steps.length}
            </p>
            <h2 className="mt-1 text-[17px] font-extrabold leading-snug text-[var(--tm-ink)]">{current.title}</h2>
          </div>
          <button
            type="button"
            aria-label="Skip tour"
            onClick={finish}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--tm-ink-muted)] hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-ink)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--tm-ink-soft)]">{current.text}</p>

        <div className="mt-4 flex items-center gap-1.5" aria-hidden>
          {steps.map((s, i) => (
            <span key={s.id} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-5 bg-[var(--tm-primary)]' : 'w-1.5 bg-[var(--tm-border-strong)]'}`} />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={finish} className="text-[12.5px] font-semibold text-[var(--tm-ink-muted)] hover:text-[var(--tm-ink)] hover:underline">
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={() => go(step - 1)} leftIcon={<ArrowLeft className="h-4 w-4" />}>
                Back
              </Button>
            )}
            <Button data-tour-next size="sm" onClick={() => (last ? finish() : go(step + 1))} rightIcon={last ? undefined : <ArrowRight className="h-4 w-4" />}>
              {last ? 'Done' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
