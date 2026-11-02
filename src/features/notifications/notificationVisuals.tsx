import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  AtSign,
  BadgeCheck,
  Bell,
  Cake,
  Calendar,
  CheckSquare,
  ClipboardList,
  Clock,
  Folder,
  MessageSquare,
  MessagesSquare,
  PartyPopper,
  Paperclip,
  Plug,
  Send,
  XCircle
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatTimeAgo } from '../../utils/time';
import { Avatar } from '../../components/ui/Avatar';
import { Skeleton } from '../../components/ui/Skeleton';
import { spring } from '../../components/ui/motion';
import { useMotionPrefs } from '../../components/ui/useMotionPrefs';
import type { AppNotification } from '../../types';

type Tone = 'success' | 'danger' | 'warning' | 'info' | 'primary' | 'neutral';

/** Soft background + icon colour for each tone, all from the theme's tokens (status colours for success / danger / warning). */
const TONE: Record<Tone, string> = {
  success: 'bg-[var(--tm-success-bg)] text-[var(--tm-success)]',
  danger: 'bg-[var(--tm-danger-bg)] text-[var(--tm-danger)]',
  warning: 'bg-[var(--tm-warning-bg)] text-[var(--tm-warning)]',
  info: 'bg-[var(--tm-info-bg)] text-[var(--tm-info)]',
  primary: 'bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]',
  neutral: 'bg-[var(--tm-neutral-bg)] text-[var(--tm-neutral)]'
};

export interface TypeVisual {
  icon: LucideIcon;
  tone: Tone;
  /** Raised by the app itself (due soon, overdue, reminders, festivals, integrations): always a tile, never a person's avatar. */
  system: boolean;
}

/** No emoji in notification text, including ones saved before this rule: icons carry that meaning now. */
export const stripEmoji = (s: string): string =>
  s
    .replace(/[\p{Extended_Pictographic}‍️]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

/** Which icon and tint a notification gets, from its type (and, for approvals, whether it was a yes or a no). */
export const typeVisual = (type: string, title = ''): TypeVisual => {
  const t = type;
  const lead = title.replace(/^[^\p{L}]+/u, ''); // the title without any leading emoji or symbol
  const approved = /^approved/i.test(lead);
  const rejected = /^rejected/i.test(lead);

  // From the system
  if (t === 'task_overdue' || t === 'overdue') return { icon: AlertTriangle, tone: 'danger', system: true };
  if (['task_due', 'task_reminder', 'task_reminders', 'approval_reminder', 'daily_status'].includes(t)) return { icon: Clock, tone: 'warning', system: true };
  if (t.startsWith('festival')) return { icon: PartyPopper, tone: 'primary', system: true };
  if (t === 'birthday') return { icon: Cake, tone: 'primary', system: true };
  if (t === 'integration_error') return { icon: AlertTriangle, tone: 'danger', system: true };
  if (t.startsWith('integration_')) return { icon: Plug, tone: 'info', system: true };
  if (t === 'test') return { icon: Bell, tone: 'neutral', system: true };

  // Usually triggered by a person
  if (t === 'mention') return { icon: AtSign, tone: 'primary', system: false };
  if (t === 'task_assigned') return { icon: CheckSquare, tone: 'primary', system: false };
  if (t === 'task_comment' || t === 'change_request' || t.startsWith('activity_')) return { icon: MessageSquare, tone: 'info', system: false };
  if (t === 'task_approved' || t === 'review_approved' || t === 'office_resolved' || ((t === 'approval_answered' || t === 'client_approval') && approved))
    return { icon: BadgeCheck, tone: 'success', system: false };
  if (t === 'review_changes_requested' || t === 'changes_requested' || t === 'task_rejected' || ((t === 'approval_answered' || t === 'client_approval') && rejected))
    return { icon: XCircle, tone: 'danger', system: false };
  if (t === 'review_requested' || t === 'task_submitted' || t === 'client_approval') return { icon: Send, tone: 'info', system: false };
  if (t.startsWith('deliverables_') || t.includes('file') || t.includes('asset')) return { icon: Paperclip, tone: 'info', system: false };
  if (t === 'booking_cancelled') return { icon: Calendar, tone: 'danger', system: false };
  if (t.startsWith('booking_')) return { icon: Calendar, tone: 'info', system: false };
  if (t === 'chat_scheduled_failed') return { icon: MessagesSquare, tone: 'danger', system: true };
  if (t.startsWith('chat_') || t === 'approval_answered') return { icon: MessagesSquare, tone: 'info', system: false };
  if (t.startsWith('office_')) return { icon: MessageSquare, tone: 'info', system: false };
  if (t.startsWith('checklist_')) return { icon: CheckSquare, tone: 'info', system: false };
  if (t.startsWith('requirement_')) return { icon: ClipboardList, tone: 'info', system: false };
  if (t === 'task_deleted' || t === 'task_unassigned') return { icon: XCircle, tone: 'danger', system: false };
  if (t.startsWith('task_')) return { icon: CheckSquare, tone: 'info', system: false };
  if (/^(project|subfolder|head|members)_/.test(t)) return { icon: Folder, tone: 'info', system: false };
  return { icon: Bell, tone: 'primary', system: false };
};

/**
 * The leading visual of a notification. A person who triggered it: their avatar (32px, initials if no photo) with a
 * 16px round badge at the bottom-right showing the type. Anything raised by the app: a 32px rounded-square tile
 * with a line icon, tinted by type. Shared by the bell and the Activity page.
 */
export const NotificationIcon: React.FC<{ n: Pick<AppNotification, 'type' | 'title' | 'actor'> }> = ({ n }) => {
  const { icon: Icon, tone, system } = typeVisual(n.type, n.title);
  if (n.actor && !system) {
    return (
      <span className="relative inline-flex h-8 w-8 shrink-0">
        <Avatar name={n.actor.name} src={n.actor.avatarUrl ?? undefined} size="md" className="!h-8 !w-8 !text-[12px]" />
        <span
          aria-hidden
          className={`absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full ${TONE[tone]}`}
          style={{ boxShadow: '0 0 0 2px var(--tm-card)' }}
        >
          <Icon className="h-[10px] w-[10px]" strokeWidth={1.75} />
        </span>
      </span>
    );
  }
  return (
    <span aria-hidden className={`grid h-8 w-8 shrink-0 place-items-center rounded-[10px] ${TONE[tone]}`}>
      <Icon className="h-4 w-4" strokeWidth={1.75} />
    </span>
  );
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
        <NotificationIcon n={n} />
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-3">
            <span
              className={`text-[13px] leading-snug ${
                n.read ? 'font-medium text-[var(--tm-ink)]' : 'font-extrabold text-[var(--tm-ink)]'
              }`}
            >
              {stripEmoji(n.title)}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <time dateTime={n.createdAt} className="text-[10.5px] font-medium text-[var(--tm-ink-muted)]">
                {formatTimeAgo(n.createdAt)}
              </time>
              {!n.read && (
                <span aria-label="Unread" className="h-2 w-2 rounded-full bg-[var(--tm-primary)]" />
              )}
            </span>
          </span>
          {n.message && (
            <span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-[var(--tm-ink-muted)]">
              {stripEmoji(n.message)}
            </span>
          )}
        </span>
      </motion.button>
    </motion.li>
  );
};

/** Grouped, sticky-headed list shared by the bell popover and the Activity page. */
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
        <Skeleton className="h-8 w-8 shrink-0" rounded="lg" />
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
