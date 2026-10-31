import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, ClipboardCheck, Clock, ListChecks, MessageSquare, Send, Sparkles } from 'lucide-react';
import { CountUp } from '../../../components/ui/CountUp';
import { StatusChip } from '../../../components/ui/StatusChip';
import { Button } from '../../../components/ui/Button';
import { StatCard } from '../../../components/ui/StatCard';
import { HeroCard, HeroStat } from '../../../components/ui/HeroCard';
import { ProgressRing } from '../../../components/ui/ProgressRing';
import { StaggerItem } from '../../../components/ui/Stagger';
import { socket } from '../../../services/socket';
import { taskApi, type ApiTask } from '../../../services/http/taskApi';
import { reviewApi } from '../../../services/http/reviewApi';
import { dashboardApi } from '../../../services/http/dashboardApi';
import type { Booking } from '../../../services/http/calendarApi';
import { ItemsDrawer } from '../../../components/ui/ItemsDrawer';
import { useChatStore } from '../../../store/useChatStore';
import { useNotificationStore } from '../../../store/useNotificationStore';
import { getTodayDateString } from '../../../utils/time';
import { dailyCounts, upcomingCounts } from '../../../utils/trend';
import { DashboardCard, RowLink, WidgetEmpty, WidgetSkeleton, timeOf } from './DashboardCard';

const OPEN = ['todo', 'in_progress', 'changes_requested'];

const TaskRow: React.FC<{ t: ApiTask; tag?: string }> = ({ t, tag }) => (
  <li>
    <RowLink to={`/app/tasks/${t.id}`}>
      <span className="min-w-0">
        <span className="line-clamp-1 block text-[13.5px] font-semibold text-[var(--tm-ink)]">{t.title}</span>
        <span className="block text-[11.5px] text-[var(--tm-ink-muted)]">
          {t.project_name} · {t.subfolder_name}
        </span>
      </span>
      {tag && <span className="shrink-0 text-[11.5px] font-bold text-[var(--tm-ink-soft)]">{tag}</span>}
    </RowLink>
  </li>
);

/** Bento tiles for the employee home. Renders into the page's 12-column grid. */
export const EmployeeWidgets: React.FC = () => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<ApiTask[] | null>(null);
  const [reviews, setReviews] = useState(0);
  const [meetings, setMeetings] = useState<Booking[] | null>(null);
  const unreadChats = useChatStore((s) => s.groups.reduce((n, g) => n + g.unread_count, 0));
  const unreadInbox = useNotificationStore((s) => s.unreadCount);
  const chatGroups = useChatStore((s) => s.groups);
  const notifications = useNotificationStore((s) => s.notifications);
  const [unreadOpen, setUnreadOpen] = useState(false);

  const load = useCallback(() => {
    taskApi.list({ mine: true }).then(setTasks).catch(() => setTasks([]));
    reviewApi.pendingCount().then(setReviews).catch(() => setReviews(0));
    dashboardApi.myMeetings().then(setMeetings).catch(() => setMeetings([]));
  }, []);

  useEffect(() => {
    load();
    return socket.on('notification', load);
  }, [load]);

  const today = getTodayDateString();
  const open = (tasks ?? []).filter((t) => OPEN.includes(t.status));
  const overdue = open.filter((t) => t.due_date && t.due_date < today);
  const dueToday = open.filter((t) => t.due_date === today);
  const upcoming = open.filter((t) => t.due_date && t.due_date > today).sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1));
  const submissions = (tasks ?? []).filter((t) => t.status === 'submitted' || t.status === 'changes_requested');

  const todayMeetings = (meetings ?? []).filter((m) => new Date(m.start).toDateString() === new Date().toDateString());
  const loadingTasks = tasks === null;
  const allTasks = tasks ?? [];
  const donePct = allTasks.length ? (allTasks.filter((t) => t.status === 'approved').length / allTasks.length) * 100 : 0;

  return (
    <>
      {/* Same hero and stat row as the admin home, with this person's own figures */}
      <StaggerItem className="lg:col-span-12">
        <HeroCard
          animate={false}
          eyebrow={
            <>
              <Sparkles className="h-3.5 w-3.5" />
              My day
            </>
          }
          title={`${open.length} open tasks & ${todayMeetings.length} meetings today`}
          description="Your tasks, reviews and schedule at a glance."
          aside={<ProgressRing value={donePct} size={148} thickness={13} label="Approved" onDark />}
          actions={
            <>
              <Button size="sm" variant="onDark" onClick={() => navigate('/app/tasks')} rightIcon={<ArrowRight className="h-4 w-4" />}>
                Open my tasks
              </Button>
              <Button size="sm" variant="ghostDark" onClick={() => navigate('/app/calendar')}>
                Calendar
              </Button>
            </>
          }
        >
          <div className="flex flex-wrap gap-8">
            <HeroStat label="Due today" value={dueToday.length} />
            <HeroStat label="Overdue" value={overdue.length} />
            <HeroStat label="In review" value={submissions.length} />
          </div>
        </HeroCard>
      </StaggerItem>

      <StaggerItem className="lg:col-span-12">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard to="/app/tasks?quick=due_today" label="Due today" value={dueToday.length} icon={<Clock className="h-5 w-5" />} tone="ok" hint="Open tasks due over the next 7 days" trend={upcomingCounts(open, (t) => t.due_date, 7)} />
          <StatCard to="/app/tasks?quick=overdue" label="Overdue" value={overdue.length} icon={<AlertTriangle className="h-5 w-5" />} tone="bad" hint="Overdue tasks by due date, last 7 days" trend={dailyCounts(overdue, (t) => t.due_date, 7)} />
          <StatCard to="/app/tasks?quick=in_review" label="In review" value={submissions.length} icon={<ClipboardCheck className="h-5 w-5" />} tone="neutral" hint="Submitted or sent back" />
          <StatCard label="Unread" onClick={() => setUnreadOpen(true)} value={unreadChats + unreadInbox} icon={<MessageSquare className="h-5 w-5" />} tone="primary" hint="Chats and inbox" />
        </div>
      </StaggerItem>

      <StaggerItem className="lg:col-span-7">
        <DashboardCard animate={false} icon={<ListChecks className="h-5 w-5" />} title="My tasks" badge={overdue.length} to="/app/tasks" cta="Open my tasks" className="h-full">
          {loadingTasks ? (
            <WidgetSkeleton />
          ) : open.length === 0 ? (
            <WidgetEmpty>You have no open tasks. Nice and clear.</WidgetEmpty>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { label: 'Overdue', n: overdue.length, bad: true },
                  { label: 'Today', n: dueToday.length },
                  { label: 'Upcoming', n: upcoming.length }
                ].map((b) => (
                  <div key={b.label} className="rounded-[var(--tm-radius-sm)] bg-[var(--tm-card-muted)] py-3">
                    <div className={`text-[28px] font-extrabold leading-none tabular-nums ${b.bad && b.n > 0 ? 'text-[var(--tm-danger)]' : 'text-[var(--tm-ink)]'}`}>
                      <CountUp value={b.n} />
                    </div>
                    <div className="mt-1 text-[11px] font-bold uppercase tracking-wide text-[var(--tm-ink-muted)]">{b.label}</div>
                  </div>
                ))}
              </div>
              <ul>
                {overdue.slice(0, 2).map((t) => (
                  <TaskRow key={t.id} t={t} tag="Overdue" />
                ))}
                {dueToday.slice(0, 2).map((t) => (
                  <TaskRow key={t.id} t={t} tag="Today" />
                ))}
                {upcoming.slice(0, 2).map((t) => (
                  <TaskRow key={t.id} t={t} tag={t.due_date ?? undefined} />
                ))}
              </ul>
            </div>
          )}
        </DashboardCard>
      </StaggerItem>

      <StaggerItem className="lg:col-span-5">
        <DashboardCard animate={false} icon={<Send className="h-5 w-5" />} title="My submissions" badge={submissions.length} to="/app/tasks" cta="Open my tasks" className="h-full">
          {loadingTasks ? (
            <WidgetSkeleton />
          ) : submissions.length === 0 ? (
            <WidgetEmpty>Nothing is waiting on a review from you.</WidgetEmpty>
          ) : (
            <ul>
              {submissions.slice(0, 5).map((t) => (
                <li key={t.id}>
                  <RowLink to={`/app/tasks/${t.id}`}>
                    <span className="line-clamp-1 text-[13.5px] font-semibold text-[var(--tm-ink)]">{t.title}</span>
                    <StatusChip tone={t.status === 'submitted' ? 'info' : 'warn'} size="sm">
                      {t.status === 'submitted' ? 'In review' : 'Changes asked'}
                    </StatusChip>
                  </RowLink>
                </li>
              ))}
            </ul>
          )}
        </DashboardCard>
      </StaggerItem>

      {reviews > 0 && (
        <StaggerItem className="lg:col-span-4">
          <DashboardCard animate={false} icon={<ClipboardCheck className="h-5 w-5" />} title="Review queue" badge={reviews} to="/app/reviews" cta="Open reviews" highlight className="h-full">
            <p className="text-[13.5px] text-[var(--tm-ink-soft)]">
              <span className="mr-2 text-[40px] font-extrabold leading-none tracking-[-0.04em] text-[var(--tm-ink)]">
                <CountUp value={reviews} />
              </span>
              {reviews === 1 ? 'submission needs' : 'submissions need'} your decision.
            </p>
          </DashboardCard>
        </StaggerItem>
      )}

      <StaggerItem className={reviews > 0 ? 'lg:col-span-4' : 'lg:col-span-6'}>
        <DashboardCard animate={false} icon={<CalendarClock className="h-5 w-5" />} title="Today's schedule" badge={todayMeetings.length} to="/app/calendar" cta="Open calendar" className="h-full">
          {meetings === null ? (
            <WidgetSkeleton rows={2} />
          ) : todayMeetings.length === 0 ? (
            <WidgetEmpty>No meetings today.</WidgetEmpty>
          ) : (
            <ul>
              {todayMeetings.map((m) => (
                <li key={m.id}>
                  <RowLink to="/app/calendar">
                    <span className="line-clamp-1 text-[13.5px] font-semibold text-[var(--tm-ink)]">{m.title}</span>
                    <span className="shrink-0 text-[12px] font-bold tabular-nums text-[var(--tm-ink-soft)]">{timeOf(m.start)}</span>
                  </RowLink>
                </li>
              ))}
            </ul>
          )}
        </DashboardCard>
      </StaggerItem>

      <StaggerItem className={reviews > 0 ? 'lg:col-span-4' : 'lg:col-span-6'}>
        <DashboardCard animate={false} icon={<MessageSquare className="h-5 w-5" />} title="Unread" badge={unreadChats + unreadInbox} to="/app/chat" cta="Open chats" className="h-full">
          <ul>
            <li>
              <RowLink to="/app/chat">
                <span className="text-[13.5px] font-semibold text-[var(--tm-ink)]">Chat messages</span>
                <span className="text-[16px] font-extrabold tabular-nums text-[var(--tm-ink)]"><CountUp value={unreadChats} /></span>
              </RowLink>
            </li>
            <li>
              <RowLink to="/app/inbox">
                <span className="flex items-center gap-2 text-[13.5px] font-semibold text-[var(--tm-ink)]">
                  Inbox notifications
                  {unreadInbox === 0 && <CheckCircle2 className="h-4 w-4 text-[var(--tm-success)]" />}
                </span>
                <span className="text-[16px] font-extrabold tabular-nums text-[var(--tm-ink)]"><CountUp value={unreadInbox} /></span>
              </RowLink>
            </li>
          </ul>
          {overdue.length > 0 && (
            <p className="flex items-center gap-2 text-[12px] font-semibold text-[var(--tm-danger)]">
              <AlertTriangle className="h-4 w-4" /> {overdue.length} overdue {overdue.length === 1 ? 'task' : 'tasks'}
            </p>
          )}
        </DashboardCard>
      </StaggerItem>
      <ItemsDrawer
        isOpen={unreadOpen}
        onClose={() => setUnreadOpen(false)}
        title="Unread"
        description="Chats with new messages and notifications you haven't read."
        empty="You're all caught up."
        sections={[
          {
            title: 'Chats',
            items: chatGroups
              .filter((g) => g.unread_count > 0)
              .map((g) => ({ id: g.id, label: g.name, sub: g.last_message?.preview, trailing: String(g.unread_count), to: '/app/chat' }))
          },
          {
            title: 'Inbox',
            items: notifications.filter((n) => !n.read).map((n) => ({ id: n.id, label: n.title, sub: n.message, to: n.link || '/app/inbox' }))
          }
        ]}
      />
    </>
  );
};
