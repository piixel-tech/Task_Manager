import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { popoverVariants } from '../../../components/ui/motion';
import { useMotionPrefs } from '../../../components/ui/useMotionPrefs';
import { useAuthStore } from '../../../store/authStore';
import { useCelebrationsStore } from '../../../store/useCelebrationsStore';
import { useSettingsStore } from '../../../store/useSettingsStore';
import { getTodayDateString } from '../../../utils/time';
import { DailyBurst, festivalSymbols } from '../../celebrations/CelebrationBurst';
import { useSendWishes } from '../../celebrations/useSendWishes';
import { dashboardHeading, greetingSubtitle, headingScale } from './greetingText';
import { useDayContext } from './useDayContext';

/** The current time, refreshed every minute, so the greeting follows the clock (and the day) without a reload. */
function useNow(ms = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

/** Today's heading for this person: the title and the subtitle both read it, so they always agree. */
function useHeading(defaultName: string) {
  const prefs = useSettingsStore((s) => s.settings.greeting);
  const meId = useAuthStore((s) => s.user?.id);
  const today = useCelebrationsStore((s) => s.today);
  const now = useNow();
  const heading = dashboardHeading({
    defaultName,
    prefs,
    now,
    mine: today.people.filter((p) => p.user_id === meId),
    others: today.people.filter((p) => p.user_id !== meId),
    festivals: today.festivals
  });
  return { heading, meId, now };
}

const popoverClass =
  'glass-strong absolute left-0 top-[calc(100%+10px)] z-50 block origin-top-left rounded-[var(--tm-radius-lg)] text-left text-[14px] font-normal leading-normal tracking-normal';

type Popover = 'wishes' | null;

/**
 * The dashboard heading, on one line (cut off with "..." if long). In order: my own birthday or work anniversary, somebody else's
 * (with their avatars and "Send wishes"), today's festival greeting, then the normal greeting for the time of day.
 * My own celebration and a festival also play a short animation, once per day.
 */
export const GreetingTitle: React.FC<{ defaultName: string }> = ({ defaultName }) => {
  const loadToday = useCelebrationsStore((s) => s.load);
  const { heading, meId } = useHeading(defaultName);
  const { reduced } = useMotionPrefs();
  const { send, busy } = useSendWishes();
  const [open, setOpen] = useState<Popover>(null);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    void loadToday();
  }, [loadToday]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const day = getTodayDateString();
  const people = heading.people.filter((p, i, all) => all.findIndex((q) => q.user_id === p.user_id) === i);
  const motionProps = {
    variants: popoverVariants,
    initial: reduced ? 'show' : 'hidden',
    animate: 'show',
    exit: reduced ? 'show' : 'exit'
  } as const;

  return (
    <span ref={ref} className={`relative flex min-w-0 items-center gap-x-2.5 gap-y-2 ${heading.kind === 'others' ? 'flex-wrap sm:flex-nowrap' : ''}`}>
      {heading.kind === 'own' && meId && <DailyBurst storageKey={`tm.celebrate.${meId}.${day}.own`} />}
      {heading.kind === 'festival' && meId && <DailyBurst storageKey={`tm.celebrate.${meId}.${day}.festival`} symbols={festivalSymbols(heading.festival)} />}

      {heading.kind === 'others' && (
        <span className="flex shrink-0 -space-x-2" aria-hidden="true">
          {people.slice(0, 3).map((p) => (
            <Avatar key={p.user_id} name={p.name ?? ''} src={p.avatar_url ?? undefined} size="md" ring />
          ))}
        </span>
      )}

      <span
        className={`line-clamp-3 min-w-0 break-words [text-wrap:balance] sm:line-clamp-2 ${heading.kind === 'others' ? 'max-sm:order-first max-sm:basis-full' : ''}`}
        style={{ fontSize: `${headingScale(heading.text)}em` }} title={heading.text}>
        {heading.text}
      </span>

      {heading.kind === 'others' && people.length > 0 && (
        <>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0"
            isLoading={people.length === 1 && busy === people[0].user_id}
            aria-label="Send wishes"
            aria-expanded={people.length > 1 ? open === 'wishes' : undefined}
            onClick={() => (people.length === 1 ? void send({ user_id: people[0].user_id!, name: people[0].name ?? '' }) : setOpen(open === 'wishes' ? null : 'wishes'))}
            leftIcon={<MessageCircle className="h-4 w-4" />}
          >
            <span className="hidden sm:inline">Send wishes</span>
          </Button>
          <AnimatePresence>
            {open === 'wishes' && (
              <motion.span role="menu" aria-label="Send wishes to" {...motionProps} className={`${popoverClass} w-[min(18rem,calc(100vw-2rem))] p-2`}>
                {people.map((p) => (
                  <button
                    key={p.user_id}
                    type="button"
                    role="menuitem"
                    disabled={busy !== null}
                    onClick={() => void send({ user_id: p.user_id!, name: p.name ?? '' }).then(() => setOpen(null))}
                    className="flex w-full items-center gap-3 rounded-[var(--tm-radius-md)] px-3 py-2 text-left hover:bg-[var(--tm-card-muted)] disabled:opacity-60"
                  >
                    <Avatar name={p.name ?? ''} src={p.avatar_url ?? undefined} size="sm" />
                    <span className="min-w-0 flex-1 truncate font-semibold text-[var(--tm-ink)]">{p.name}</span>
                    <MessageCircle className="h-4 w-4 shrink-0 text-[var(--tm-ink-muted)]" />
                  </button>
                ))}
              </motion.span>
            )}
          </AnimatePresence>
        </>
      )}

    </span>
  );
};

/**
 * The line under the greeting, from how my day looks. It is plain text inside the page header's own subtitle paragraph, so it
 * looks the same for a normal, celebration or festival greeting and wraps on small screens.
 */
export const GreetingSubtitle: React.FC = () => {
  const ctx = useDayContext();
  const now = useNow();
  return <>{greetingSubtitle({ ...ctx, now })}</>;
};
