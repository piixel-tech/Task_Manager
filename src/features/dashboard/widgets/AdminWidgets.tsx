import React, { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, CalendarClock, ClipboardCheck, FolderKanban, ShieldQuestion, Users } from 'lucide-react';
import { StatCard } from '../../../components/ui/StatCard';
import { ProgressBar } from '../../../components/ui/ProgressRing';
import { Avatar } from '../../../components/ui/Avatar';
import { StaggerItem } from '../../../components/ui/Stagger';
import { CountUp } from '../../../components/ui/CountUp';
import { socket } from '../../../services/socket';
import { dashboardApi, type AdminDashboard } from '../../../services/http/dashboardApi';
import { formatTimeAgo } from '../../../utils/time';
import { DashboardCard, RowLink, WidgetEmpty, WidgetSkeleton, dayOf, timeOf } from './DashboardCard';

/** Bento tiles for the admin home. Renders straight into the page's 12-column grid. */
export const AdminWidgets: React.FC = () => {
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    dashboardApi
      .admin()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the dashboard'));
  }, []);

  useEffect(() => {
    load();
    const offs = ['chat:message_update', 'chat:group'].map((e) => socket.on(e, load));
    const offNote = socket.on('notification', load);
    return () => {
      offs.forEach((off) => off());
      offNote();
    };
  }, [load]);

  const t = data?.tasks;
  const loading = !data;

  return (
    <>
      {error && <div className="tm-error px-4 py-3 text-xs font-semibold lg:col-span-12">{error}</div>}

      {/* Tasks overview */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 lg:col-span-12">
          <StatCard label="Overdue" to="/admin/tasks?quick=overdue" value={t?.overdue ?? 0} icon={<AlertTriangle className="h-5 w-5" />} tone={t?.overdue ? 'bad' : 'neutral'} hint="Overdue tasks per person" trend={data?.workload.map((w) => w.overdue)} />
          <StatCard label="Due today" to="/admin/tasks?quick=due_today" value={t?.due_today ?? 0} icon={<CalendarClock className="h-5 w-5" />} tone={t?.due_today ? 'warn' : 'neutral'} hint="Finish before the day ends" />
          <StatCard label="In review" to="/admin/reviews" value={t?.in_review ?? 0} icon={<ClipboardCheck className="h-5 w-5" />} tone="primary" hint="In review per project" trend={data?.projects.map((p) => p.in_review)} />
          <StatCard label="Open tasks" to="/admin/tasks?quick=open" value={t?.open ?? 0} icon={<FolderKanban className="h-5 w-5" />} tone="neutral" hint="Open per project" trend={data?.projects.map((p) => p.open)} trendKind="line" />
      </div>

      {/* Approvals */}
      <StaggerItem className="lg:col-span-6">
        <DashboardCard animate={false}
          icon={<ShieldQuestion className="h-5 w-5" />}
          title="Client approvals waiting"
          badge={data?.approvals.length}
          to="/admin/chat"
          cta="Open chats"
          className="h-full"
        >
          {loading ? (
            <WidgetSkeleton />
          ) : data.approvals.length === 0 ? (
            <WidgetEmpty>No client is waiting on an answer in your chats.</WidgetEmpty>
          ) : (
            <ul>
              {data.approvals.map((i) => (
                <li key={i.approval.id}>
                  <RowLink to="/admin/chat">
                    <span className="min-w-0">
                      <span className="block text-[11px] font-bold uppercase tracking-wide text-[var(--tm-ink-muted)]">{i.group_name}</span>
                      <span className="line-clamp-1 block text-[13.5px] font-semibold text-[var(--tm-ink)]">{i.approval.question}</span>
                    </span>
                    <span className="shrink-0 text-[11px] font-medium text-[var(--tm-ink-muted)]">{formatTimeAgo(i.approval.created_at)}</span>
                  </RowLink>
                </li>
              ))}
            </ul>
          )}
        </DashboardCard>
      </StaggerItem>

      {/* Today's meetings */}
      <StaggerItem className="lg:col-span-6">
        <DashboardCard animate={false} icon={<CalendarClock className="h-5 w-5" />} title="Today's meetings" badge={data?.meetings.length} to="/admin/calendar" cta="Open calendar" className="h-full">
          {loading ? (
            <WidgetSkeleton />
          ) : data.meetings.length === 0 ? (
            <WidgetEmpty>No meetings booked for today.</WidgetEmpty>
          ) : (
            <ul>
              {data.meetings.map((m) => (
                <li key={m.id}>
                  <RowLink to={`/admin/calendar/${m.host_user_id}`}>
                    <span className="line-clamp-1 text-[13.5px] font-semibold text-[var(--tm-ink)]">{m.title}</span>
                    <span className="shrink-0 text-[12px] font-bold tabular-nums text-[var(--tm-ink-soft)]">
                      {timeOf(m.start)} – {timeOf(m.end)}
                    </span>
                  </RowLink>
                </li>
              ))}
            </ul>
          )}
        </DashboardCard>
      </StaggerItem>

      {/* Project health */}
      <StaggerItem className="lg:col-span-7">
        <DashboardCard animate={false} icon={<FolderKanban className="h-5 w-5" />} title="Project health" to="/admin/projects" cta="All projects" className="h-full">
          {loading ? (
            <WidgetSkeleton />
          ) : data.projects.length === 0 ? (
            <WidgetEmpty>No projects yet.</WidgetEmpty>
          ) : (
            <ul>
              {data.projects.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <RowLink to={`/admin/projects/${p.id}`}>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-[13.5px] font-bold text-[var(--tm-ink)]">{p.name}</span>
                        <span className="shrink-0 text-[11.5px] text-[var(--tm-ink-muted)]">
                          {p.open} open
                          {p.overdue > 0 && <span className="font-bold text-[var(--tm-danger)]"> · {p.overdue} overdue</span>}
                          {p.in_review > 0 && ` · ${p.in_review} in review`}
                        </span>
                      </span>
                      <ProgressBar value={p.progress} tone={p.overdue > 0 ? 'bad' : 'primary'} height={6} className="mt-2" />
                    </span>
                  </RowLink>
                </li>
              ))}
            </ul>
          )}
        </DashboardCard>
      </StaggerItem>

      {/* Team workload */}
      <StaggerItem className="lg:col-span-5">
        <DashboardCard animate={false} icon={<Users className="h-5 w-5" />} title="Team workload" to="/admin/tasks" cta="Open tasks" className="h-full">
          {loading ? (
            <WidgetSkeleton />
          ) : data.workload.length === 0 ? (
            <WidgetEmpty>Nobody has open tasks.</WidgetEmpty>
          ) : (
            <ul>
              {data.workload.map((w) => {
                const max = Math.max(...data.workload.map((x) => x.open), 1);
                return (
                  <li key={w.user.id}>
                    <RowLink to={`/admin/people/${w.user.id}`}>
                      <Avatar name={w.user.name} src={w.user.avatar_url ?? undefined} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[13px] font-bold text-[var(--tm-ink)]">{w.user.name}</span>
                          <span className="shrink-0 text-[12px] font-bold tabular-nums text-[var(--tm-ink-soft)]">
                            <CountUp value={w.open} />
                            {w.overdue > 0 && <span className="text-[var(--tm-danger)]"> · {w.overdue} late</span>}
                          </span>
                        </span>
                        <ProgressBar value={(100 * w.open) / max} tone={w.overdue > 0 ? 'bad' : 'primary'} height={5} className="mt-1.5" />
                      </span>
                    </RowLink>
                  </li>
                );
              })}
            </ul>
          )}
        </DashboardCard>
      </StaggerItem>

      {/* Recent activity */}
      <StaggerItem className="lg:col-span-12">
        <DashboardCard animate={false} icon={<Activity className="h-5 w-5" />} title="Recent activity" to="/admin/tasks" cta="Open tasks">
          {loading ? (
            <WidgetSkeleton rows={4} />
          ) : data.activity.length === 0 ? (
            <WidgetEmpty>No activity recorded yet.</WidgetEmpty>
          ) : (
            <ul className="grid gap-x-6 md:grid-cols-2">
              {data.activity.map((a) => (
                <li key={a.id}>
                  <RowLink to={a.task_id ? `/admin/tasks/${a.task_id}` : `/admin/projects/${a.project_id}`}>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-bold text-[var(--tm-ink)]">
                        {a.author?.name ?? 'Someone'}
                        {a.task_title ? <span className="font-semibold text-[var(--tm-ink-soft)]"> · {a.task_title}</span> : null}
                      </span>
                      <span className="line-clamp-1 block text-[12px] text-[var(--tm-ink-muted)]">{a.text || a.kind.replace('_', ' ')}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-[var(--tm-ink-muted)]" title={dayOf(a.created_at)}>
                      {formatTimeAgo(a.created_at)}
                    </span>
                  </RowLink>
                </li>
              ))}
            </ul>
          )}
        </DashboardCard>
      </StaggerItem>
    </>
  );
};
