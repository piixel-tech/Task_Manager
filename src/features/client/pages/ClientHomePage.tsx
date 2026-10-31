import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarClock, ClipboardList, Layers, MessageSquare, PartyPopper, ShieldQuestion, Sparkles } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/Card';
import { Stagger } from '../../../components/ui/Stagger';
import { DashboardCard, RowLink, WidgetEmpty, WidgetSkeleton, dayOf, timeOf } from '../../dashboard/widgets/DashboardCard';
import { dashboardApi } from '../../../services/http/dashboardApi';
import type { Booking } from '../../../services/http/calendarApi';
import { Button } from '../../../components/ui/Button';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ProgressBar, ProgressRing } from '../../../components/ui/ProgressRing';
import { StatCard } from '../../../components/ui/StatCard';
import { HeroCard, HeroStat } from '../../../components/ui/HeroCard';
import { dailyCounts } from '../../../utils/trend';
import { CountUp } from '../../../components/ui/CountUp';
import { SkeletonGrid } from '../../../components/ui/Skeleton';
import { useAuthStore } from '../../../store/authStore';
import { useChatStore } from '../../../store/useChatStore';
import { socket } from '../../../services/socket';
import { UpcomingHolidays } from '../../workspace/UpcomingHolidays';
import { portalApi, type PortalSummary } from '../../../services/http/portalApi';

const monthName = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** The portal home: what needs the client's answer, how this month's work is going, and what they asked for lately. */
export const ClientHomePage: React.FC = () => {
  const navigate = useNavigate();
  const name = useAuthStore((s) => s.user?.name.split(' ')[0]);
  const unread = useChatStore((s) => s.groups.reduce((n, g) => n + g.unread_count, 0));
  const [data, setData] = useState<PortalSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<Booking[] | null>(null);

  const load = useCallback(() => {
    portalApi
      .summary()
      .then((s) => {
        setData(s);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your summary'));
  }, []);

  useEffect(() => {
    load();
    dashboardApi.myMeetings().then(setMeetings).catch(() => setMeetings([]));
    const offs = ['chat:message_update', 'chat:group'].map((e) => socket.on(e, load));
    const offNote = socket.on('notification', (n: { type?: string }) => {
      if (n?.type?.startsWith('requirement_') || n?.type?.startsWith('approval_') || n?.type === 'client_approval') load();
    });
    return () => {
      offs.forEach((off) => off());
      offNote();
    };
  }, [load]);

  const donePct = data && data.deliverables.total ? Math.round((100 * data.deliverables.done) / data.deliverables.total) : 0;

  return (
    <>
      <PageHeader title={`Welcome${name ? `, ${name}` : ''}`} description="Here is where your projects stand." />
      {error && <div className="tm-error px-4 py-3 text-xs font-semibold">{error}</div>}
      {!data ? (
        error ? null : <SkeletonGrid count={3} />
      ) : (
        <Stagger className="grid gap-6 lg:grid-cols-12">
          <HeroCard
            animate={false}
            className="lg:col-span-8"
            eyebrow={
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Client Portal
              </>
            }
            title={`${data.pending_approvals} waiting for your answer & ${data.deliverables.remaining} deliverables to go`}
            description="Where your projects stand this month."
            aside={<ProgressRing value={donePct} size={148} thickness={13} label="Done" onDark />}
            actions={
              <>
                <Button size="sm" variant="onDark" onClick={() => navigate('/client/approvals')} rightIcon={<ArrowRight className="h-4 w-4" />}>
                  Respond
                </Button>
                <Button size="sm" variant="ghostDark" onClick={() => navigate('/client/deliverables')}>
                  Deliverables
                </Button>
              </>
            }
          >
            <div className="flex flex-wrap gap-8">
              <HeroStat label="Approvals" value={data.pending_approvals} />
              <HeroStat label="Done" value={data.deliverables.done} />
              <HeroStat label="Meetings" value={meetings?.length ?? 0} />
            </div>
          </HeroCard>

          <Card lift className="lg:col-span-4">
            <CardContent className="flex h-full flex-col justify-center gap-3 pt-7">
              <Link to="/client/chats">
                <Button variant="outline" className="w-full justify-between" rightIcon={<ArrowRight className="h-4 w-4" />} leftIcon={<MessageSquare className="h-4 w-4" />}>
                  Chats{unread > 0 ? ` · ${unread} unread` : ''}
                </Button>
              </Link>
              <Link to="/client/meetings">
                <Button variant="outline" className="w-full justify-between" rightIcon={<ArrowRight className="h-4 w-4" />} leftIcon={<CalendarClock className="h-4 w-4" />}>
                  Book a meeting with the team
                </Button>
              </Link>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 lg:col-span-12">
            <StatCard to="/client/approvals" label="Approvals" value={data.pending_approvals} icon={<ShieldQuestion className="h-5 w-5" />} tone="primary" hint="Waiting for your answer" trend={dailyCounts(data.approvals, (i) => i.approval.created_at, 7)} />
            <StatCard to="/client/deliverables" label="Deliverables done" value={data.deliverables.done} icon={<Layers className="h-5 w-5" />} tone="ok" hint={`${data.deliverables.remaining} remaining this month`} progress={data.deliverables.done + data.deliverables.remaining ? Math.round((100 * data.deliverables.done) / (data.deliverables.done + data.deliverables.remaining)) : 0} />
            <StatCard to="/client/chats" label="Unread chats" value={unread} icon={<MessageSquare className="h-5 w-5" />} tone="neutral" hint="Messages from the team" />
          </div>

          <DashboardCard icon={<ShieldQuestion className="h-5 w-5" />} title="Waiting for your answer" badge={data.pending_approvals} to="/client/approvals" cta="Respond" highlight={data.pending_approvals > 0} className="lg:col-span-12">
            {data.approvals.length === 0 ? (
              <p className="flex items-center gap-2 rounded-[var(--tm-radius-sm)] bg-[var(--tm-card-muted)] p-4 text-[13.5px] font-semibold text-[var(--tm-ink-soft)]">
                <PartyPopper className="h-4 w-4 text-[var(--tm-primary-dark)]" />
                Nothing is waiting for you.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--tm-border)]">
                {data.approvals.map((i) => (
                  <li key={i.approval.id} className="py-2.5">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--tm-ink-muted)]">{i.group_name}</p>
                    <p className="line-clamp-2 text-[14px] font-semibold text-[var(--tm-ink)]">{i.approval.question}</p>
                  </li>
                ))}
                {data.pending_approvals > data.approvals.length && (
                  <li className="pt-2.5 text-[12.5px] text-[var(--tm-ink-muted)]">and {data.pending_approvals - data.approvals.length} more</li>
                )}
              </ul>
            )}
          </DashboardCard>

          <DashboardCard icon={<Layers className="h-5 w-5" />} title={`Deliverables · ${monthName(data.month)}`} to="/client/deliverables" cta="Open tracker" className="lg:col-span-5">
            {data.deliverables.total === 0 ? (
              <p className="rounded-[var(--tm-radius-sm)] bg-[var(--tm-card-muted)] p-4 text-[13.5px] text-[var(--tm-ink-muted)]">Nothing is planned for this month yet.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <p className="text-[14px] font-bold text-[var(--tm-ink)]">
                    {data.deliverables.done} done / {data.deliverables.remaining} remaining
                  </p>
                  <span className="text-[56px] font-extrabold leading-none tracking-[-0.04em] tabular-nums text-[var(--tm-ink)]"><CountUp value={donePct} suffix="%" /></span>
                </div>
                <ProgressBar value={donePct} tone={data.deliverables.remaining === 0 ? 'ok' : 'primary'} height={12} />
                <p className="text-[12px] text-[var(--tm-ink-muted)]">An item is done once it is posted. Work in progress moves the overall bar to {data.deliverables.progress}%.</p>
                <ul className="flex flex-wrap gap-2 pt-1">
                  {Object.entries(data.stages ?? {}).map(([stage, n]) => (
                    <li key={stage} className="rounded-full bg-[var(--tm-card-muted)] px-3 py-1.5 text-[11.5px] font-bold text-[var(--tm-ink-soft)]">
                      {stage.replace(/_/g, ' ')} <span className="tabular-nums text-[var(--tm-ink)]">{n}</span>
                    </li>
                  ))}
                </ul>
                {(data.projects ?? []).length > 1 && (
                  <ul className="space-y-2 pt-1">
                    {data.projects.map((p) => (
                      <li key={p.id} className="flex items-center gap-3 text-[12px] font-semibold text-[var(--tm-ink-soft)]">
                        <span className="w-28 shrink-0 truncate">{p.name}</span>
                        <ProgressBar value={p.progress} height={6} />
                        <span className="tabular-nums">{p.progress}%</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </DashboardCard>

          <DashboardCard icon={<CalendarClock className="h-5 w-5" />} title="Upcoming meetings" badge={meetings?.length} to="/client/meetings" cta="Open meetings" className="lg:col-span-5">
            {meetings === null ? (
              <WidgetSkeleton rows={2} />
            ) : meetings.length === 0 ? (
              <WidgetEmpty>No meetings booked. Book one with the team.</WidgetEmpty>
            ) : (
              <ul>
                {meetings.slice(0, 4).map((m) => (
                  <li key={m.id}>
                    <RowLink to="/client/meetings">
                      <span className="line-clamp-1 text-[13.5px] font-semibold text-[var(--tm-ink)]">{m.title}</span>
                      <span className="shrink-0 text-right text-[11.5px] font-bold text-[var(--tm-ink-soft)]">
                        {dayOf(m.start)}
                        <br />
                        {timeOf(m.start)}
                      </span>
                    </RowLink>
                  </li>
                ))}
              </ul>
            )}
          </DashboardCard>

          <DashboardCard icon={<ClipboardList className="h-5 w-5" />} title="Latest requirements" to="/client/requirements" cta="See all" className="lg:col-span-7">
            {data.latest_requirements.length === 0 ? (
              <p className="rounded-[var(--tm-radius-sm)] bg-[var(--tm-card-muted)] p-4 text-[13.5px] text-[var(--tm-ink-muted)]">Nothing recorded yet. Tell the team what you need.</p>
            ) : (
              <ul className="divide-y divide-[var(--tm-border)]">
                {data.latest_requirements.map((r) => (
                  <li key={r.id} className="py-2.5">
                    <p className="line-clamp-1 text-[14px] font-semibold text-[var(--tm-ink)]">{r.title}</p>
                    <p className="text-[12px] text-[var(--tm-ink-muted)]">
                      {r.author?.name ?? 'Someone'} · {day(r.created_at)}
                      {r.subfolder ? ` · ${r.subfolder.name}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </DashboardCard>

          <UpcomingHolidays className="lg:col-span-4" />
        </Stagger>
      )}
    </>
  );
};
