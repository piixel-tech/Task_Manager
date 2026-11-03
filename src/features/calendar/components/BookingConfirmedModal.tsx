import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarDays, Copy, Video } from 'lucide-react';
import { differenceInMinutes, format, parseISO } from 'date-fns';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { useMotionPrefs } from '../../../components/ui/useMotionPrefs';
import { backdropVariants } from '../../../components/ui/motion';
import { toast } from '../../../store/useToastStore';
import type { Booking } from '../../../services/http/calendarApi';
import { isMeetUrl } from '../../google/googleUtils';

export interface ConfirmedGuest {
  name: string;
  avatar_url?: string | null;
}

/** Your own Google Calendar, opened on the day of the booking. */
export const googleCalendarDayUrl = (start: Date): string =>
  `https://calendar.google.com/calendar/u/0/r/day/${start.getFullYear()}/${start.getMonth() + 1}/${start.getDate()}`;

const CONFETTI_COLOURS = ['var(--tm-primary)', 'var(--tm-accent-fixed)', 'var(--tm-success)', 'var(--tm-warning)', 'var(--tm-info)', 'var(--tm-danger)'];

/** Fixed (not random) scatter, so the burst is the same every time and rendering stays pure. */
const PIECES = Array.from({ length: 44 }, (_, i) => {
  const angle = (i / 44) * Math.PI * 2 + (i % 3) * 0.17;
  const dist = 120 + ((i * 53) % 150);
  return {
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist * 0.8 - 40,
    fall: 70 + ((i * 29) % 90),
    rot: ((i * 97) % 540) - 270,
    size: 6 + (i % 4) * 2,
    round: i % 3 === 0,
    colour: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length],
    delay: (i % 6) * 0.015
  };
});

const Confetti: React.FC = () => (
  <div aria-hidden className="pointer-events-none absolute left-1/2 top-[34%] z-20 h-0 w-0">
    {PIECES.map((p, i) => (
      <motion.i
        key={i}
        className={`absolute block ${p.round ? 'rounded-full' : 'rounded-[2px]'}`}
        style={{ width: p.size, height: p.size * (p.round ? 1 : 0.5), background: p.colour }}
        initial={{ x: 0, y: 0, opacity: 1, scale: 0.4, rotate: 0 }}
        animate={{ x: p.x, y: [0, p.y, p.y + p.fall], opacity: [1, 1, 0], scale: 1, rotate: p.rot }}
        transition={{ duration: 1.5, delay: 0.25 + p.delay, ease: [0.16, 1, 0.3, 1], opacity: { duration: 1.5, delay: 0.25 + p.delay, times: [0, 0.7, 1] } }}
      />
    ))}
  </div>
);

/** A check mark that draws itself inside a circle. */
const DrawnCheck: React.FC<{ reduced: boolean }> = ({ reduced }) => (
  <svg viewBox="0 0 52 52" className="h-14 w-14" aria-hidden>
    <motion.circle
      cx="26"
      cy="26"
      r="23"
      fill="color-mix(in srgb, var(--tm-success) 14%, transparent)"
      stroke="var(--tm-success)"
      strokeWidth="3"
      strokeLinecap="round"
      initial={reduced ? false : { pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 0.55, delay: 0.35, ease: 'easeOut' }}
    />
    <motion.path
      d="M15 27 L23 35 L38 18"
      fill="none"
      stroke="var(--tm-success)"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={reduced ? false : { pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 0.4, delay: 0.85, ease: 'easeOut' }}
    />
  </svg>
);

export interface BookingConfirmedModalProps {
  booking: Booking | null;
  /** The person booked with, shown first among the avatars. */
  host: ConfirmedGuest | null;
  guests: ConfirmedGuest[];
  onClose: () => void;
}

/**
 * Shown after a booking is saved: a confetti burst, a ticket-style card that flips in (date in large type, time, length,
 * guest avatars, the Meet link with a copy button), a check that draws itself, and the buttons Open in Google Calendar,
 * Join Meet and Done. Closing scales it away. Reduced motion: no confetti, flip or drawing; it simply appears and goes.
 */
export const BookingConfirmedModal: React.FC<BookingConfirmedModalProps> = ({ booking, host, guests, onClose }) => {
  const { reduced } = useMotionPrefs();

  useEffect(() => {
    if (!booking) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [booking, onClose]);

  const view = useMemo(() => {
    if (!booking) return null;
    const start = parseISO(booking.start);
    const end = parseISO(booking.end);
    return { start, end, minutes: differenceInMinutes(end, start) };
  }, [booking]);

  const people = [...(host ? [host] : []), ...guests];
  const meet = booking?.meet_url && isMeetUrl(booking.meet_url) ? booking.meet_url : null;

  const copy = async () => {
    if (!meet) return;
    try {
      await navigator.clipboard.writeText(meet);
      toast.success('Meet link copied');
    } catch {
      toast.error('Could not copy the link', 'Select it and copy it by hand.');
    }
  };

  return createPortal(
    <AnimatePresence>
      {booking && view && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            variants={backdropVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            onClick={onClose}
            className="absolute inset-0 bg-[var(--tm-scrim)] backdrop-blur-[6px]"
          />
          {!reduced && <Confetti />}

          <div className="relative z-10 w-full max-w-sm [perspective:1100px]">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Booking confirmed"
              initial={reduced ? false : { rotateX: -82, opacity: 0, y: 24, scale: 0.96 }}
              animate={{ rotateX: 0, opacity: 1, y: 0, scale: 1 }}
              exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { scale: 0.88, opacity: 0, transition: { duration: 0.24, ease: [0.4, 0, 0.2, 1] } }}
              transition={{ type: 'spring', stiffness: 170, damping: 19, delay: 0.05 }}
              style={{ transformOrigin: '50% 0%' }}
              className="glass-strong overflow-hidden rounded-[var(--tm-radius-xl)]"
            >
              {/* Stub: the check and the date */}
              <div className="flex flex-col items-center px-7 pb-5 pt-7 text-center">
                <DrawnCheck reduced={reduced} />
                <h2 className="mt-2 text-[19px] font-extrabold tracking-[-0.02em] text-[var(--tm-ink)]">Booking confirmed</h2>
                {booking.title && <p className="mt-0.5 max-w-full truncate text-[13px] text-[var(--tm-ink-soft)]">{booking.title}</p>}
                <div className="mt-4 flex items-end gap-3">
                  <span className="text-[64px] font-black leading-[0.9] tabular-nums text-[var(--tm-ink)]">{format(view.start, 'd')}</span>
                  <span className="pb-1 text-left leading-tight">
                    <span className="block text-[15px] font-extrabold uppercase tracking-wider text-[var(--tm-primary-dark)]">{format(view.start, 'MMM yyyy')}</span>
                    <span className="block text-[13px] font-semibold text-[var(--tm-ink-soft)]">{format(view.start, 'EEEE')}</span>
                  </span>
                </div>
                <p className="mt-3 text-[17px] font-bold tabular-nums text-[var(--tm-ink)]">
                  {format(view.start, 'HH:mm')} – {format(view.end, 'HH:mm')}
                  <span className="ml-2 rounded-full bg-[var(--tm-bg-sunken)] px-2.5 py-0.5 text-[11.5px] font-bold text-[var(--tm-ink-soft)]">{view.minutes} min</span>
                </p>
              </div>

              {/* Tear line with the ticket notches */}
              <div aria-hidden className="relative h-0 border-t-2 border-dashed border-[var(--tm-border-strong)]">
                <i className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-[var(--tm-scrim)]" />
                <i className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-[var(--tm-scrim)]" />
              </div>

              <div className="space-y-4 px-7 pb-6 pt-5">
                {people.length > 0 && (
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-2">
                      {people.slice(0, 6).map((p, i) => (
                        <Avatar key={`${p.name}-${i}`} name={p.name} src={p.avatar_url ?? undefined} size="sm" ring />
                      ))}
                    </div>
                    <p className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--tm-ink-soft)]">
                      {people.map((p) => p.name).join(', ')}
                      {people.length > 6 ? ` +${people.length - 6}` : ''}
                    </p>
                  </div>
                )}

                {meet && (
                  <div className="flex items-center gap-2 rounded-full bg-[var(--tm-card-muted)] py-1.5 pl-4 pr-1.5">
                    <Video className="h-4 w-4 shrink-0 text-[var(--tm-primary-dark)]" />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-[var(--tm-ink)]">{meet.replace(/^https?:\/\//, '')}</span>
                    <button
                      type="button"
                      onClick={copy}
                      aria-label="Copy Meet link"
                      title="Copy link"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--tm-card)] text-[var(--tm-ink)] transition-colors hover:bg-[var(--tm-bg-sunken)]"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap justify-center gap-2 pt-1">
                  <a href={googleCalendarDayUrl(view.start)} target="_blank" rel="noopener noreferrer">
                    <Button type="button" variant="outline" size="sm" leftIcon={<CalendarDays className="h-4 w-4" />}>
                      Open in Google Calendar
                    </Button>
                  </a>
                  {meet && (
                    <a href={meet} target="_blank" rel="noopener noreferrer">
                      <Button type="button" variant="secondary" size="sm" leftIcon={<Video className="h-4 w-4" />}>
                        Join Meet
                      </Button>
                    </a>
                  )}
                  <Button type="button" size="sm" onClick={onClose} autoFocus>
                    Done
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
