import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Clock,
  Coffee,
  FolderKanban,
  Play,
  Plus,
  Users
} from 'lucide-react';
import {
  projectService,
  taskService,
  userService
} from '../../../services';
import type { Project, Task, User } from '../../../types';
import { AdminWidgets } from '../../dashboard/widgets/AdminWidgets';
import { taskApi, type ApiTask } from '../../../services/http/taskApi';
import { TodayOverview } from '../../status/components/TodayOverview';
import { OfficeBoardCard } from '../../office/components/OfficeBoardCard';
import { UpcomingHolidays } from '../../workspace/UpcomingHolidays';
import { useDailyStatusStore } from '../../../store/useDailyStatusStore';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { CornerButton } from '../../../components/ui/CornerButton';
import { ItemsDrawer } from '../../../components/ui/ItemsDrawer';
import { StatCard } from '../../../components/ui/StatCard';
import { HeroCard, HeroStat } from '../../../components/ui/HeroCard';
import { ProgressRing } from '../../../components/ui/ProgressRing';
import { StatusChip } from '../../../components/ui/StatusChip';
import { UserName } from '../../../components/ui/UserName';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StaggerItem } from '../../../components/ui/Stagger';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import { useAppStore } from '../../../store/useAppStore';

export const AdminDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { companyFilter } = useAppStore();

  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [liveTasks, setLiveTasks] = useState<ApiTask[]>([]);
  const overview = useDailyStatusStore((s) => s.overview);
  const loadOverview = useDailyStatusStore((s) => s.loadOverview);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState<'present' | 'leave' | null>(null);

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
    taskApi.list().then((all) => setLiveTasks(all.filter((t) => t.timer_running))).catch(() => undefined);
    loadOverview();
  }, [loadOverview]);

  const displayName = 'Boss'; // the admin is greeted as Boss, whatever their name
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

  const runningTasks = liveTasks;

  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const throughput = tasks.length > 0 ? (completedTasks.length / tasks.length) * 100 : 0;

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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Hero card */}
        <HeroCard
          className="lg:col-span-12"

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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 lg:col-span-12">
          <StatCard
            label="Working today"
            onClick={() => setDrawer('present')}
            value={presentToday.length}
            icon={<Clock className="h-5 w-5" />}
            tone="ok"
            hint={`${filteredUsers.length} total team members`}
          />

          <StatCard
            label="On leave"
            onClick={() => setDrawer('leave')}
            value={onLeaveToday.length}
            icon={<Coffee className="h-5 w-5" />}
            tone="warn"
            hint="Marked leave for today"
          />

          <StatCard
            label="Tasks running"
            to="/admin/tasks?quick=running"
            value={runningTasks.length}
            icon={<Play className="h-5 w-5" />}
            tone="primary"
            hint="Timers active right now"
          />

          <StatCard
            label="Active projects"
            to="/admin/projects"
            value={filteredProjects.length}
            icon={<FolderKanban className="h-5 w-5" />}
            tone="neutral"
            hint="Open the projects page"
          />
        </div>

        <div className="lg:col-span-12">
          <OfficeBoardCard />
        </div>

        <div className="lg:col-span-4">
          <UpcomingHolidays />
        </div>

        <div className="lg:col-span-12">
          <TodayOverview />
        </div>

        {/* Live Board Shortcut Widget */}
        <Card lift className="lg:col-span-7">
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-extrabold">
                <Activity className="h-4 w-4 text-[var(--tm-primary-dark)]" />
                Live Board Preview
              </CardTitle>
              <p className="mt-0.5 text-[12.5px] text-[var(--tm-ink-muted)]">
                Tasks being worked on right now
              </p>
            </div>
            <CornerButton label="Open Task Hub" onClick={() => navigate('/admin/tasks')} />
          </CardHeader>

          <CardContent>
            {runningTasks.length === 0 ? (
              <div className="rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] py-10 text-center text-xs text-[var(--tm-ink-muted)]">
                No active timers running at this moment.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                {runningTasks.slice(0, 4).map((t) => {
                  const assignedUser = users.find((u) => u.id === t.assignee?.id);
                  return (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-3 rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] p-4 transition-colors hover:bg-[var(--tm-bg-sunken)]"
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

        <AdminWidgets />

        {/* Initiatives / Projects */}
        <StaggerItem className="lg:col-span-12">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[22px] font-extrabold tracking-[-0.025em] text-[var(--tm-ink)]">
              Active Projects
            </h2>
            <CornerButton label="View all projects" onClick={() => navigate('/admin/projects')} />
          </div>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
            <div className="animate-fade-in grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredProjects.slice(0, 6).map((p) => (
                <Card key={p.id} interactive animate={false} onClick={() => navigate(`/admin/projects/${p.id}`)}>
                  <CardContent className="pt-7">
                    <h3 className="text-[16px] font-bold leading-snug text-[var(--tm-ink)]">{p.name}</h3>
                    <p className="mt-1.5 text-[12.5px] capitalize text-[var(--tm-ink-muted)]">{p.company}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </StaggerItem>
      </div>
      <ItemsDrawer
        isOpen={drawer !== null}
        onClose={() => setDrawer(null)}
        title={drawer === 'leave' ? 'On leave today' : 'Working today'}
        description={drawer === 'leave' ? 'Marked leave for today.' : 'In the office, working from home or on a half day.'}
        empty="Nobody right now."
        sections={[
          {
            items: (drawer === 'leave' ? onLeaveToday : presentToday).map((r) => ({
              id: r.user_id,
              label: r.name,
              sub: r.status === 'wfh' ? 'Working from home' : r.status === 'half_day' ? 'Half day' : r.status === 'leave' ? 'On leave' : 'Present',
              avatar: { name: r.name, src: r.avatar_url ?? undefined },
              to: `/admin/people/${r.user_id}`
            }))
          }
        ]}
      />
    </>
  );
};
