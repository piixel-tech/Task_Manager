import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Bell, CheckCircle2, Clock, Info, MessageSquare, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatTimeAgo } from '../../utils/time';
import { Skeleton } from '../../components/ui/Skeleton';
import { spring } from '../../components/ui/motion';
import { useMotionPrefs } from '../../components/ui/useMotionPrefs';
import type { AppNotification } from '../../types';

interface TypeVisual {
  icon: LucideIcon;
  /** Soft circle background + icon colour, both from the --tm-* tokens. */
  circle: string;
}

/** Red for things that need action, amber for reminders, green for approvals, blue for updates. */
export const typeVisual = (type: string): TypeVisual => {
  if (type === 'changes_requested' || type === 'review_changes_requested' || type === 'booking_cancelled')
    return { icon: AlertTriangle, circle: 'bg-[var(--tm-danger-bg)] text-[var(--tm-danger)]' };
  if (type === 'task_due' || type === 'task_reminder')
    return { icon: Clock, circle: 'bg-[var(--tm-warning-bg)] text-[var(--tm-warning)]' };
  if (type === 'task_approved' || type === 'review_approved' || type === 'office_resolved')
    return { icon: CheckCircle2, circle: 'bg-[var(--tm-success-bg)] text-[var(--tm-success)]' };
  if (type === 'checklist_updated' || type === 'deliverables_updated')
    return { icon: Info, circle: 'bg-[var(--tm-info-bg)] text-[var(--tm-info)]' };
  if (type === 'office_post' || type === 'office_reopened')
    return { icon: MessageSquare, circle: 'bg-[var(--tm-info-bg)] text-[var(--tm-info)]' };
  return { icon: Sparkles, circle: 'bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]' };
};

export interface DayGroup {
  /** Today, Yesterday, a weekday (this week) or a date such as "25 Oct". */
  label: string;
  items: AppNotification[];
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

const dayLabel = (day: number, now: Date): string => {
  const today = startOfDay(now);
  const daysAgo = Math.round((today - day) / (24 * 60 * 60 * 1000));
  const d = new Date(day);
  const sameYear = d.getFullYear() === now.getFullYear();
  const date = d.toLocaleDateString('en-GB', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  if (daysAgo <= 0) return `Today · ${date}`;
  if (daysAgo === 1) return `Yesterday · ${date}`;
  if (daysAgo < 7) return `${d.toLocaleDateString('en-GB', { weekday: 'long' })} · ${date}`;
  return date;
};

/** One group per calendar day, newest first, from each notification's createdAt. */
export const groupByDay = (items: AppNotification[], now: Date = new Date()): DayGroup[] => {
  const sorted = [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const groups: DayGroup[] = [];
  let currentDay: number | null = null;
  for (const n of sorted) {
    const day = startOfDay(new Date(n.createdAt));
    if (day !== currentDay) {
      groups.push({ label: dayLabel(day, now), items: [] });
      currentDay = day;
    }
    groups[groups.length - 1].items.push(n);
  }
  return groups;
};

export const DayHeader: React.FC<{ label: string }> = ({ label }) => (
  <div className="sticky top-0 z-10 -mx-1 bg-[var(--tm-card)] px-3 py-1.5">
    <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-[var(--tm-ink-muted)]">{label}</span>
  </div>
);

interface CardProps {
  n: AppNotification;
  index: number;
  onClick: () => void;
}

export const NotificationCard: React.FC<CardProps> = ({ n, index, onClick }) => {
  const { reduced } = useMotionPrefs();
  const { icon: Icon, circle } = typeVisual(n.type);
  return (
    <motion.li
      layout={!reduced}
      initial={reduced ? false : { opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { ...spring, delay: reduced ? 0 : Math.min(index, 8) * 0.04 } }}
      exit={reduced ? undefined : { opacity: 0, x: 28, scale: 0.97, transition: { duration: 0.2 } }}
      className="list-none"
    >
      <motion.button
        type="button"
        onClick={onClick}
        whileHover={reduced ? undefined : { y: -2 }}
        whileTap={reduced ? undefined : { scale: 0.985 }}
        className={`flex w-full items-start gap-3 rounded-[var(--tm-radius-md)] border px-3.5 py-3 text-left
          transition-[background-color,box-shadow,border-color] hover:shadow-soft-sm ${
            n.read
              ? 'border-transparent bg-[var(--tm-card)] hover:bg-[var(--tm-bg-sunken)]'
              : 'border-[var(--tm-border)] bg-[var(--tm-primary-softer)] hover:bg-[var(--tm-primary-softer)]'
          }`}
      >
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${circle}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-3">
            <span
              className={`text-[13px] leading-snug ${
                n.read ? 'font-medium text-[var(--tm-ink)]' : 'font-extrabold text-[var(--tm-ink)]'
              }`}
            >
              {n.title}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <time dateTime={n.createdAt} className="text-[10.5px] font-medium text-[var(--tm-ink-muted)]">
                {formatTimeAgo(n.createdAt)}
              </time>
              {!n.read && (
                <span
                  aria-label="Unread"
                  className="h-2 w-2 rounded-full bg-[var(--tm-primary)]"
                  style={{ boxShadow: '0 0 8px 2px var(--tm-primary)' }}
                />
              )}
            </span>
          </span>
          {n.message && (
            <span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-[var(--tm-ink-muted)]">
              {n.message}
            </span>
          )}
        </span>
      </motion.button>
    </motion.li>
  );
};

/** Grouped, sticky-headed list shared by the bell popover and the inbox page. */
export const NotificationGroups: React.FC<{
  items: AppNotification[];
  onOpen: (n: AppNotification) => void;
}> = ({ items, onOpen }) => {
  let index = 0;
  return (
    <>
      {groupByDay(items).map((g) => (
        <section key={g.label} aria-label={g.label}>
          <DayHeader label={g.label} />
          <ul className="space-y-1.5 pb-2">
            <AnimatePresence mode="popLayout" initial>
              {g.items.map((n) => (
                <NotificationCard key={n.id} n={n} index={index++} onClick={() => onOpen(n)} />
              ))}
            </AnimatePresence>
          </ul>
        </section>
      ))}
    </>
  );
};

export const NotificationSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <div className="space-y-1.5 p-2" aria-busy="true">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="flex items-start gap-3 rounded-[var(--tm-radius-md)] px-3.5 py-3">
        <Skeleton className="h-9 w-9 shrink-0" rounded="full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-2/3" rounded="full" />
          <Skeleton className="h-2.5 w-full" rounded="full" />
        </div>
      </div>
    ))}
  </div>
);

export const AllCaughtUp: React.FC<{ title?: string; description?: string }> = ({
  title = "You're all caught up",
  description = 'Nothing new right now.'
}) => (
  <div className="flex flex-col items-center px-6 py-10 text-center">
    <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--tm-solid)] shadow-soft-sm">
      <Bell className="h-6 w-6 text-[var(--tm-primary-dark)]" />
    </span>
    <p className="mt-3 text-[14px] font-extrabold text-[var(--tm-ink)]">{title}</p>
    <p className="mt-0.5 text-[12px] text-[var(--tm-ink-muted)]">{description}</p>
  </div>
);
