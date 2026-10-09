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
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import {
  attendanceService,
  projectService,
  taskService,
  userService
} from '../../../services';
import type { AttendanceDay, Project, Task, User } from '../../../types';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { StatCard } from '../../../components/ui/StatCard';
import { HeroCard, HeroStat } from '../../../components/ui/HeroCard';
import { ProgressRing } from '../../../components/ui/ProgressRing';
import { StatusChip } from '../../../components/ui/StatusChip';
import { AvatarStack } from '../../../components/ui/AvatarStack';
import { UserName } from '../../../components/ui/UserName';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StaggerItem } from '../../../components/ui/Stagger';
import { SkeletonCard, SkeletonRows } from '../../../components/ui/Skeleton';
import { useAuthStore } from '../../../store/authStore';
import { useAppStore } from '../../../store/useAppStore';
import { getTodayDateString, formatTime } from '../../../utils/time';

export const AdminDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { companyFilter } = useAppStore();

  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [attendance, setAttendance] = useState<AttendanceDay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      userService.getUsers(),
      projectService.getProjects(),
      taskService.getTasks(),
      attendanceService.getAttendance()
    ])
      .then(([usr, prj, tsk, att]) => {
        setUsers(usr);
        setProjects(prj);
        setTasks(tsk);
        setAttendance(att);
      })
      .finally(() => setLoading(false));
  }, []);

  const displayName = user?.nickname || user?.name || 'Admin';
  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? 'Good morning' : currentHour < 17 ? 'Good afternoon' : 'Good evening';

  const filteredUsers = useMemo(
    () => users.filter((u) => companyFilter === 'all' || u.company === companyFilter),
    [users, companyFilter]
  );

  const filteredProjects = useMemo(
    () =>
      projects.filter(
        (p) => companyFilter === 'all' || p.company === companyFilter || p.company === 'both'
      ),
    [projects, companyFilter]
  );

  const today = getTodayDateString();
  const todayRecords = attendance.filter((a) => a.date === today);
  const presentToday = todayRecords.filter((a) => a.status === 'present');
  const onLeaveToday = todayRecords.filter((a) => a.status === 'on_leave');

  const runningTasks = tasks.filter((t) =>
    t.sessions.some((s) => !s.endTime)
  );

  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const throughput = tasks.length > 0 ? (completedTasks.length / tasks.length) * 100 : 0;

  // Project Progress Half-Donut Gauge calculation
  const completedProjects = filteredProjects.filter((p) => p.status === 'completed');
  const projectProgressPct = filteredProjects.length > 0
    ? Math.round((completedProjects.length / filteredProjects.length) * 100)
    : 0;

  const halfDonutData = [
    { name: 'Completed', value: completedProjects.length || 1 },
    { name: 'Remaining', value: Math.max(0, filteredProjects.length - completedProjects.length) || 1 }
  ];

  // Team activity list with status chips
  const teamActivities = useMemo(() => {
    const list: {
      id: string;
      user: User;
      action: string;
      time: string;
      status: 'present' | 'in_progress' | 'review' | 'completed' | 'on_leave';
    }[] = [];

    todayRecords.forEach((att) => {
      const u = users.find((usr) => usr.id === att.userId);
      if (!u) return;
      const lastSession = att.punchSessions[att.punchSessions.length - 1];

      if (att.status === 'on_leave') {
        list.push({
          id: `att-${att.id}`,
          user: u,
          action: 'Marked on leave today',
          time: 'Today',
          status: 'on_leave'
        });
      } else if (lastSession) {
        list.push({
          id: `att-${att.id}`,
          user: u,
          action: lastSession.punchOut ? `Punched out at ${formatTime(lastSession.punchOut)}` : `Punched in at ${formatTime(lastSession.punchIn)}`,
          time: formatTime(lastSession.punchOut || lastSession.punchIn),
          status: 'present'
        });
      }
    });

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
  }, [todayRecords, tasks, users]);

  return (
    <>
      <PageHeader
        title={`${greeting}, ${displayName}`}
        description="Real-time workspace stats, project gauges, live board preview, and team activities."
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
        title={`${runningTasks.length} active tasks & ${presentToday.length} members present`}
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
            <Button size="sm" variant="ghostDark" onClick={() => navigate('/admin/liveboard')}>
              Live Board
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap gap-8">
          <HeroStat label="Present today" value={presentToday.length} />
          <HeroStat label="On leave" value={onLeaveToday.length} />
          <HeroStat label="Tasks running" value={runningTasks.length} />
        </div>
      </HeroCard>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 xl:grid-cols-3">
        <StatCard
          label="Present today"
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
          hint="Approved leave requests today"
        />

        <StatCard
          label="Tasks running"
          value={runningTasks.length}
          icon={<Play className="h-5 w-5" />}
          tone="primary"
          hint="Timers active right now"
        />
      </div>

      {/* Live Board Preview & Half-Donut Gauge */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Project Progress Half-Donut Gauge */}
        <Card className="xl:col-span-1 flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="text-base font-extrabold">Project Progress Gauge</CardTitle>
            <p className="text-[12.5px] text-[var(--tm-ink-muted)]">
              Overall project completion percentage
            </p>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center pt-0 pb-6">
            <div className="relative w-[200px] h-[120px] flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <Pie
                    data={halfDonutData}
                    cx={100}
                    cy={100}
                    startAngle={180}
                    endAngle={0}
                    innerRadius={62}
                    outerRadius={86}
                    dataKey="value"
                    isAnimationActive={true}
                  >
                    <Cell fill="var(--tm-primary)" />
                    <Cell fill="var(--tm-bg-sunken)" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              <div className="absolute bottom-2 inset-x-0 flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-black tabular-nums text-[var(--tm-ink)]">
                  {projectProgressPct}%
                </span>
                <span className="text-[10px] font-bold text-[var(--tm-ink-muted)] uppercase">
                  Completion
                </span>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-6 text-[12px] font-semibold text-[var(--tm-ink-soft)]">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--tm-primary)]" />
                {completedProjects.length} Done
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--tm-bg-sunken)] border border-[var(--tm-border)]" />
                {filteredProjects.length - completedProjects.length} In Flight
              </span>
            </div>
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
                Real-time snapshot of running timers and active shifts
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate('/admin/liveboard')}
              rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
            >
              Full Live Board
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
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filteredProjects.slice(0, 6).map((p) => {
              const projectTasks = tasks.filter((t) => t.projectId === p.id);
              const done = projectTasks.filter((t) => t.status === 'completed').length;
              const members = users
                .filter((u) => p.memberIds?.includes(u.id) || p.assignedUserIds?.includes(u.id))
                .map((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatarUrl }));

              return (
                <Card
                  key={p.id}
                  interactive
                  animate={false}
                  onClick={() => navigate(`/admin/projects/${p.id}`)}
                >
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-[16px] font-bold leading-snug text-[var(--tm-ink)]">
                        {p.name}
                      </h3>
                      <StatusChip status={p.status} size="sm" />
                    </div>

                    {p.clientName && (
                      <p className="mt-1.5 text-[12.5px] text-[var(--tm-ink-muted)]">
                        {p.clientName}
                      </p>
                    )}

                    <div className="mt-5 flex items-center justify-between">
                      <AvatarStack people={members} max={4} size="sm" />
                      <span className="text-[12px] font-semibold text-[var(--tm-ink-soft)] tabular-nums">
                        {done}/{projectTasks.length} tasks
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </StaggerItem>
    </>
  );
};
