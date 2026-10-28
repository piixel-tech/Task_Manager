import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Clock,
  Coffee,
  Play,
  Plus,
  Sparkles,
  Users
} from 'lucide-react';
import {
  projectService,
  taskService,
  userService
} from '../../../services';
import type { Project, Task, User } from '../../../types';
import { TodayOverview } from '../../status/components/TodayOverview';
import { OfficeBoardCard } from '../../office/components/OfficeBoardCard';
import { useDailyStatusStore } from '../../../store/useDailyStatusStore';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { StatCard } from '../../../components/ui/StatCard';
import { HeroCard, HeroStat } from '../../../components/ui/HeroCard';
import { ProgressRing } from '../../../components/ui/ProgressRing';
import { StatusChip } from '../../../components/ui/StatusChip';
import { UserName } from '../../../components/ui/UserName';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StaggerItem } from '../../../components/ui/Stagger';
import { SkeletonCard, SkeletonRows } from '../../../components/ui/Skeleton';
import { useAuthStore } from '../../../store/authStore';
import { useAppStore } from '../../../store/useAppStore';

export const AdminDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { companyFilter } = useAppStore();

  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const overview = useDailyStatusStore((s) => s.overview);
  const loadOverview = useDailyStatusStore((s) => s.loadOverview);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      userService.getUsers(),
      projectService.getProjects(),
      taskService.getTasks()
    ])
      .then(([usr, prj, tsk]) => {
        setUsers(usr);
        setProjects(prj);
        setTasks(tsk);
      })
      .finally(() => setLoading(false));
    loadOverview();
  }, [loadOverview]);

  const displayName = user?.nickname || user?.name || 'Admin';
  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? 'Good morning' : currentHour < 17 ? 'Good afternoon' : 'Good evening';

  const filteredUsers = useMemo(
    () => users.filter((u) => u.active && (companyFilter === 'all' || u.company === companyFilter)),
    [users, companyFilter]
  );

  const filteredProjects = useMemo(
    () =>
      projects.filter(
        (p) => companyFilter === 'all' || p.company === companyFilter || p.company === 'both'
      ),
    [projects, companyFilter]
  );

  const presentToday = overview.filter((r) => r.status === 'present' || r.status === 'wfh' || r.status === 'half_day');
  const onLeaveToday = overview.filter((r) => r.status === 'leave');

  const runningTasks = tasks.filter((t) =>
    t.sessions.some((s) => !s.endTime)
  );

  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const throughput = tasks.length > 0 ? (completedTasks.length / tasks.length) * 100 : 0;

  // Team activity list with status chips
  const teamActivities = useMemo(() => {
    const list: {
      id: string;
      user: User;
      action: string;
      time: string;
      status: 'in_progress' | 'review' | 'completed';
    }[] = [];

    tasks.forEach((t) => {
      const u = users.find((usr) => usr.id === t.assignedUserId);
      if (!u) return;

      if (t.status === 'review') {
        list.push({
          id: `tsk-${t.id}`,
          user: u,
          action: `Submitted "${t.title}" for review`,
          time: 'Recent',
          status: 'review'
        });
      } else if (t.status === 'in_progress') {
        list.push({
          id: `tsk-${t.id}`,
          user: u,
          action: `Working on "${t.title}"`,
          time: 'Live',
          status: 'in_progress'
        });
      }
    });

    return list.slice(0, 6);
  }, [tasks, users]);

  return (
    <>
      <PageHeader
        title={`${greeting}, ${displayName}`}
        description="Who is in today, workspace stats, project gauges and team activity."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/admin/users')}
              leftIcon={<Users className="h-4 w-4" />}
            >
              Manage team
            </Button>
            <Button
              size="sm"
              onClick={() => navigate('/admin/projects')}
              leftIcon={<Plus className="h-4 w-4" />}
            >
              New project
            </Button>
          </>
        }
      />

      {/* Hero card */}
      <HeroCard
        eyebrow={
          <>
            <Sparkles className="h-3.5 w-3.5" />
            Executive Console
          </>
        }
        title={`${runningTasks.length} active tasks & ${presentToday.length} members in today`}
        description="Real-time workspace operation across Piixel Studio & Unwork SaaS."
        aside={
          <ProgressRing
            value={throughput}
            size={148}
            thickness={13}
            label="Throughput"
            onDark
          />
        }
        actions={
          <>
            <Button
              size="sm"
              variant="onDark"
              onClick={() => navigate('/admin/tasks')}
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Open Task Hub
            </Button>
            <Button size="sm" variant="ghostDark" onClick={() => navigate('/admin/calendar')}>
              Calendar
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap gap-8">
          <HeroStat label="Working today" value={presentToday.length} />
          <HeroStat label="On leave" value={onLeaveToday.length} />
          <HeroStat label="Tasks running" value={runningTasks.length} />
        </div>
      </HeroCard>

      <OfficeBoardCard />

      <TodayOverview />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 xl:grid-cols-3">
        <StatCard
          label="Working today"
          value={presentToday.length}
          icon={<Clock className="h-5 w-5" />}
          tone="ok"
          hint={`${filteredUsers.length} total team members`}
        />

        <StatCard
          label="On leave"
          value={onLeaveToday.length}
          icon={<Coffee className="h-5 w-5" />}
          tone="warn"
          hint="Marked leave for today"
        />

        <StatCard
          label="Tasks running"
          value={runningTasks.length}
          icon={<Play className="h-5 w-5" />}
          tone="primary"
          hint="Timers active right now"
        />
      </div>

      {/* Running timers & Half-Donut Gauge */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Projects summary */}
        <Card className="xl:col-span-1 flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="text-base font-extrabold">Projects</CardTitle>
            <p className="text-[12.5px] text-[var(--tm-ink-muted)]">Each project is split into subfolders with their own heads.</p>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center gap-1 pb-8 pt-2">
            <span className="text-5xl font-black tabular-nums text-[var(--tm-ink)]">{filteredProjects.length}</span>
            <span className="text-[11px] font-bold uppercase text-[var(--tm-ink-muted)]">Active projects</span>
            <Button className="mt-5" size="sm" variant="outline" onClick={() => navigate('/admin/projects')}>
              Manage projects
            </Button>
          </CardContent>
        </Card>

        {/* Live Board Shortcut Widget */}
        <Card className="xl:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-extrabold flex items-center gap-2">
                <Activity className="h-4 w-4 text-[var(--tm-primary)]" />
                Live Board Preview
              </CardTitle>
              <p className="mt-0.5 text-[12.5px] text-[var(--tm-ink-muted)]">
                Tasks being worked on right now
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate('/admin/tasks')}
              rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
            >
              Open Task Hub
            </Button>
          </CardHeader>

          <CardContent>
            {runningTasks.length === 0 ? (
              <div className="py-8 text-center text-xs text-[var(--tm-ink-muted)]">
                No active timers running at this moment.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {runningTasks.slice(0, 4).map((t) => {
                  const assignedUser = users.find((u) => u.id === t.assignedUserId);
                  return (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-3 rounded-[var(--tm-radius-lg)] bg-[var(--tm-card-muted)] p-3.5 border border-[var(--tm-border)]"
                    >
                      <div className="min-w-0">
                        {assignedUser && (
                          <UserName user={assignedUser} size="sm" showBadge={false} />
                        )}
                        <h4 className="mt-1 truncate text-[13px] font-bold text-[var(--tm-ink)]">
                          {t.title}
                        </h4>
                      </div>
                      <StatusChip tone="ok" size="sm" dot>
                        Running
                      </StatusChip>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Team Activities */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Team Activity Feed</CardTitle>
          <StatusChip tone="ok" size="sm" dot>
            Live
          </StatusChip>
        </CardHeader>
        <CardContent className="px-3">
          {loading ? (
            <SkeletonRows count={4} />
          ) : teamActivities.length === 0 ? (
            <p className="py-6 text-center text-xs text-[var(--tm-ink-muted)]">
              No activity recorded yet today.
            </p>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {teamActivities.map((act) => (
                <li
                  key={act.id}
                  className="flex items-center justify-between gap-3 rounded-[var(--tm-radius-md)] px-3 py-2.5 bg-[var(--tm-card-muted)] transition-colors hover:bg-[var(--tm-bg-sunken)]"
                >
                  <div className="min-w-0">
                    <UserName user={act.user} size="sm" showBadge={false} />
                    <p className="mt-0.5 truncate text-[11.5px] text-[var(--tm-ink-muted)]">
                      {act.action}
                    </p>
                  </div>
                  <StatusChip status={act.status} size="sm" />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Initiatives / Projects */}
      <StaggerItem>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[19px] font-bold tracking-[-0.02em] text-[var(--tm-ink)]">
            Active Projects
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/admin/projects')}
            rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
          >
            View all projects
          </Button>
        </div>

        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : filteredProjects.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-xs text-[var(--tm-ink-muted)]">
              No active projects yet. Click &quot;New project&quot; to get started.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filteredProjects.slice(0, 6).map((p) => (
              <Card key={p.id} interactive animate={false} onClick={() => navigate(`/admin/projects/${p.id}`)}>
                <CardContent className="pt-6">
                  <h3 className="text-[16px] font-bold leading-snug text-[var(--tm-ink)]">{p.name}</h3>
                  <p className="mt-1.5 text-[12.5px] capitalize text-[var(--tm-ink-muted)]">{p.company}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </StaggerItem>
    </>
  );
};
