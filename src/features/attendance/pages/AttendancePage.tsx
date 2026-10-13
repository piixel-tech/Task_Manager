import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase,
  Calendar as CalendarIcon,
  CheckSquare,
  Coffee,
  FileCheck,
  Play,
  Pause,
  ArrowRight
} from 'lucide-react';
import { useAuthStore } from '../../../store/authStore';
import { useAppStore } from '../../../store/useAppStore';
import { useAttendanceStore } from '../../../store/useAttendanceStore';
import { attendanceService, projectService } from '../../../services';
import type { AttendanceDay, Task, Project, TaskSession } from '../../../types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { StatusChip } from '../../../components/ui/StatusChip';
import { Modal } from '../../../components/ui/Modal';
import { StatCard } from '../../../components/ui/StatCard';
import { SlideToConfirm } from '../../../components/ui/SlideToConfirm';
import { PageHeader } from '../../../components/ui/PageHeader';
import { EmptyState } from '../../../components/ui/EmptyState';
import { HatchedBarChart, type HatchedBarDatum } from '../../../components/ui/HatchedBarChart';
import { StaggerItem } from '../../../components/ui/Stagger';
import {
  calculateDurationSeconds,
  formatDate,
  formatTime,
  getNowISO,
  getTodayDateString
} from '../../../utils/time';
import { formatHours } from '../../../utils/format';
import { TaskSubmitModal } from '../../tasks/components/TaskSubmitModal';
import { DailyUpdateModal } from '../../gamification/components/DailyUpdateModal';
import { TimeTrackerCard } from '../components/TimeTrackerCard';
import { parseISO, format, subDays } from 'date-fns';

import { useTaskStore, getTasksDoneThisWeekCount } from '../../../store/useTaskStore';
import { calculateBreakMinutes } from '../../../store/useAttendanceStore';
import { DailyProgressRing } from '../../employee/components/DailyProgressRing';

export const AttendancePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { showToast } = useAppStore();
  const {
    todayAttendance: storeRecord,
    punchIn: storePunchIn,
    punchOut: storePunchOut,
    endMyDay: storeEndMyDay,
    resumeMyDay: storeResumeMyDay,
    fetchTodayAttendance
  } = useAttendanceStore();

  const storeTasks = useTaskStore((state) => state.tasks);
  const fetchStoreTasks = useTaskStore((state) => state.fetchTasks);

  const [history, setHistory] = useState<AttendanceDay[]>([]);
  const [myProjects, setMyProjects] = useState<Project[]>([]);
  const [taskToSubmit, setTaskToSubmit] = useState<Task | null>(null);
  const [isEndDayModalOpen, setIsEndDayModalOpen] = useState(false);
  const [isDailyUpdateModalOpen, setIsDailyUpdateModalOpen] = useState(false);

  const [nowISO, setNowISO] = useState(getNowISO());

  const fetchAttendance = async () => {
    if (!user) return;
    try {
      const [records, , allProjects] = await Promise.all([
        attendanceService.getAttendance(user.id),
        fetchStoreTasks(),
        projectService.getProjects()
      ]);
      setHistory(records);
      fetchTodayAttendance(user.id);

      const userPrjs = allProjects.filter((p: Project) => p.memberIds.includes(user.id));
      setMyProjects(userPrjs);
    } catch (err: any) {
      showToast(err.message || 'Error loading dashboard data');
    }
  };

  useEffect(() => {
    fetchAttendance();
    const interval = setInterval(() => {
      setNowISO(getNowISO());
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const myTasks = useMemo(() => {
    if (!user) return [];
    return storeTasks.filter((t) => t.assignedUserId === user.id);
  }, [storeTasks, user]);

  const runningTask = useMemo(() => {
    if (!user) return null;
    return storeTasks.find((t) =>
      t.sessions.some((s: TaskSession) => !s.endTime && s.userId === user.id)
    ) || null;
  }, [storeTasks, user]);

  const handlePauseRunningTask = async () => {
    if (!user || !runningTask) return;
    try {
      await useTaskStore.getState().stopTaskSession(runningTask.id, user.id);
      showToast('Running task paused.');
    } catch (err: any) {
      showToast(err.message || 'Failed to pause task');
    }
  };

  const handleStartTaskTimer = async (taskId: string) => {
    if (!user) return;
    try {
      const res = await useTaskStore.getState().startTaskSession(taskId, user.id);
      if (res.needConfirm) {
        showToast(`Timer already running on ${res.runningTaskName}. Pause it first.`);
      } else {
        showToast('Started task timer!');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to start timer');
    }
  };

  const todayRecord = storeRecord;
  const activePunch = todayRecord?.punchSessions.find((s) => !s.punchOut);
  const dayEndedAt = todayRecord?.dayEndedAt;
  const isDayEnded = !!dayEndedAt;
  const firstPunchInTime = todayRecord?.punchSessions[0]?.punchIn;
  const lastPunchOutSession = todayRecord?.punchSessions.slice().reverse().find((s) => s.punchOut);
  const lastPunchOutTime = lastPunchOutSession?.punchOut;

  const liveBreakMinutes = useMemo(() => calculateBreakMinutes(todayRecord, nowISO), [todayRecord, nowISO]);

  let liveWorkedSeconds = 0;
  if (todayRecord) {
    for (const session of todayRecord.punchSessions) {
      if (session.punchIn) {
        const sessSecs = calculateDurationSeconds(session.punchIn, session.punchOut || nowISO);
        let breakSecs = 0;
        for (const b of session.breaks) {
          if (b.breakStart) {
            breakSecs += calculateDurationSeconds(
              b.breakStart,
              b.breakEnd || (session.punchOut ? session.punchOut : nowISO)
            );
          }
        }
        liveWorkedSeconds += Math.max(0, sessSecs - breakSecs);
      }
    }
  }

  const liveWorkedHours = liveWorkedSeconds / 3600;
  const shiftProgress = Math.min(100, (liveWorkedHours / 8) * 100);

  // Tasks done this week (Calculated live from Zustand store tasks)
  const tasksDoneThisWeek = useMemo(() => {
    if (!user) return 0;
    return getTasksDoneThisWeekCount(storeTasks, user.id);
  }, [storeTasks, user]);

  // Weekly hours HatchedBarChart
  const weekBars: HatchedBarDatum[] = useMemo(() => {
    const todayStr = getTodayDateString();
    const todayDate = parseISO(`${todayStr}T00:00:00`);

    return Array.from({ length: 7 }).map((_, i) => {
      const day = subDays(todayDate, 6 - i);
      const key = format(day, 'yyyy-MM-dd');
      const isToday = key === todayStr;
      const isFuture = day > todayDate;

      const attRecord = history.find((a) => a.date === key);
      let hours = attRecord ? attRecord.totalHours : 0;
      if (isToday) {
        hours = liveWorkedHours;
      }

      return {
        label: format(day, 'EEE'),
        value: Math.round(hours * 10) / 10,
        hatched: isFuture || (!isToday && hours === 0),
        note: isToday ? `Today: ${Math.round(hours * 10) / 10}h` : hours === 0 ? 'No hours' : `${format(day, 'MMM d')}`
      };
    });
  }, [history, liveWorkedHours]);

  // Upcoming tasks
  const upcomingTasks = useMemo(() => {
    return myTasks
      .filter((t) => t.status === 'todo' || (t.status === 'in_progress' && t.id !== runningTask?.id))
      .slice(0, 4);
  }, [myTasks, runningTask]);

  const handlePunchIn = async () => {
    if (!user) return;
    try {
      await storePunchIn(user.id);
      showToast('Punched in! Shift active.');
      fetchAttendance();
    } catch (err: any) {
      showToast(err.message || 'Failed to punch in');
    }
  };

  const handlePunchOut = async () => {
    if (!user) return;
    try {
      await storePunchOut(user.id);
      showToast('Punched out. Shift timer paused.');
      fetchAttendance();
    } catch (err: any) {
      showToast(err.message || 'Failed to punch out');
    }
  };

  const handleConfirmEndDay = async () => {
    if (!user) return;
    try {
      await storeEndMyDay(user.id);
      showToast('Done for the day! Great job today.');
      setIsEndDayModalOpen(false);
      setIsDailyUpdateModalOpen(true);
      fetchAttendance();
    } catch (err: any) {
      showToast(err.message || 'Failed to end day');
    }
  };

  const handleResumeDay = async () => {
    if (!user) return;
    try {
      await storeResumeMyDay(user.id);
      showToast('Day resumed. Back to working — timer is running.');
      fetchAttendance();
    } catch (err: any) {
      showToast(err.message || 'Failed to resume day');
    }
  };

  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? 'Good morning' : currentHour < 17 ? 'Good afternoon' : 'Good evening';
  const displayName = user?.nickname || user?.name || 'Employee';
  const formattedTodayDate = formatDate(getTodayDateString(), 'EEEE, MMMM d, yyyy');

  return (
    <>
      {/* Greeting Header */}
      <PageHeader
        title={`${greeting}, ${displayName}`}
        description={formattedTodayDate}
        actions={
          <div className="flex items-center gap-2">
            <StatusChip
              tone={isDayEnded ? 'neutral' : activePunch ? 'ok' : 'neutral'}
              size="md"
              dot
            >
              {isDayEnded
                ? `Done for the day · ${formatTime(dayEndedAt)}`
                : activePunch
                ? 'Punched In'
                : 'Punched Out'}
            </StatusChip>
          </div>
        }
      />


      {/* Row of StatCards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {/* First card as green HeroCard */}
        <div className="rounded-[var(--tm-radius-xl)] bg-[var(--tm-primary)] text-white p-6 shadow-hero relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/80">
              Hours Worked Today
            </div>
            <div className="mt-3 text-[34px] font-black leading-none tabular-nums">
              {formatHours(liveWorkedHours)}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-end">
            <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-extrabold text-white">
              {Math.round(shiftProgress)}%
            </span>
          </div>
        </div>

        {/* Daily Progress Ring */}
        <DailyProgressRing />

        <StatCard
          label="Tasks Done This Week"
          value={tasksDoneThisWeek}
          icon={<CheckSquare className="h-5 w-5" />}
          tone="ok"
          hint="Completed in this week interval"
        />

        <StatCard
          label="Break Minutes"
          value={liveBreakMinutes}
          suffix=" min"
          icon={<Coffee className="h-5 w-5" />}
          tone="neutral"
          hint="Across today's sessions"
        />
      </div>

      {/* Time Tracker Shared Component */}
      <TimeTrackerCard todayRecord={todayRecord} onRefresh={fetchAttendance} />

      {/* SlideToConfirm Actions for Accidental Tap Prevention */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-bold">Shift Safety Controls (SlideToConfirm)</CardTitle>
          <CardDescription>Slide to confirm punch actions safely</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isDayEnded ? (
            <SlideToConfirm
              label="Slide to Resume Day"
              confirmedLabel="Day Resumed!"
              onConfirm={handleResumeDay}
            />
          ) : (
            <>
              {!activePunch ? (
                <SlideToConfirm
                  label="Slide to Punch In"
                  confirmedLabel="Punched In!"
                  onConfirm={handlePunchIn}
                />
              ) : (
                <SlideToConfirm
                  label="Slide to Punch Out"
                  confirmedLabel="Punched Out!"
                  onConfirm={handlePunchOut}
                  tone="danger"
                />
              )}

              {todayRecord && todayRecord.punchSessions.length > 0 && (
                <SlideToConfirm
                  label="Slide to End My Day"
                  confirmedLabel="Day Ended!"
                  onConfirm={() => setIsEndDayModalOpen(true)}
                  tone="danger"
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Current Task Card */}
      {runningTask ? (
        <Card className="border-2 border-[var(--tm-primary)]/30">
          <CardContent className="flex flex-col gap-5 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip tone="ok" size="sm" dot>
                  Current running task
                </StatusChip>
                <StatusChip status={runningTask.priority} size="sm" />
              </div>
              <h3 className="mt-2 text-[17px] font-bold text-[var(--tm-ink)]">
                {runningTask.title}
              </h3>
              {runningTask.subHeading && (
                <p className="mt-0.5 text-[12.5px] text-[var(--tm-ink-muted)]">
                  {runningTask.subHeading}
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-4">
              <div className="text-right">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--tm-ink-muted)]">
                  Logged
                </div>
                <div className="text-[20px] font-extrabold tabular-nums text-[var(--tm-primary)]">
                  {formatHours(runningTask.loggedHours || 0)}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePauseRunningTask}
                  leftIcon={<Pause className="h-3.5 w-3.5" />}
                >
                  Pause
                </Button>
                <Button
                  size="sm"
                  onClick={() => setTaskToSubmit(runningTask)}
                  leftIcon={<FileCheck className="h-3.5 w-3.5" />}
                >
                  End task
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={<CheckSquare className="h-6 w-6 text-[var(--tm-primary)]" />}
              title="No active task running"
              description="Start a timer from your upcoming tasks below to begin logging work."
              actionLabel="View all tasks"
              onAction={() => navigate('/app/tasks')}
            />
          </CardContent>
        </Card>
      )}

      {/* Weekly Hours HatchedBarChart & Upcoming Tasks */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Weekly Hours Chart */}
        <Card className="xl:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <div>
              <CardTitle>Weekly Hours Logged</CardTitle>
              <CardDescription>Future days are hatched; today is highlighted.</CardDescription>
            </div>
            <Badge variant="primary">Target 8h / day</Badge>
          </CardHeader>
          <CardContent>
            <HatchedBarChart
              data={weekBars}
              unit="h"
              solidLabel="Hours logged"
              hatchedLabel="Future / Pending"
            />
          </CardContent>
        </Card>

        {/* Upcoming Tasks List */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Upcoming Tasks</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/app/tasks')}
              rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
            >
              All
            </Button>
          </CardHeader>
          <CardContent className="px-3">
            {upcomingTasks.length === 0 ? (
              <p className="py-6 text-center text-xs text-[var(--tm-ink-muted)]">
                No upcoming tasks. Create one from Task Hub!
              </p>
            ) : (
              <ul className="space-y-2">
                {upcomingTasks.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-3 rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] p-3 transition-colors hover:bg-[var(--tm-bg-sunken)]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <StatusChip status={t.priority} size="sm" />
                        <h4 className="truncate text-[13px] font-bold text-[var(--tm-ink)]">
                          {t.title}
                        </h4>
                      </div>
                      {t.dueDate && (
                        <span className="text-[11px] text-[var(--tm-ink-muted)]">
                          Due {formatDate(t.dueDate, 'MMM d')}
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleStartTaskTimer(t.id)}
                      leftIcon={<Play className="h-3.5 w-3.5" />}
                    >
                      Start
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* My Projects with Coloured Icons */}
      <StaggerItem>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[19px] font-bold tracking-[-0.02em] text-[var(--tm-ink)]">
            My Projects
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/app/projects')}
            rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
          >
            View all projects
          </Button>
        </div>

        {myProjects.length === 0 ? (
          <EmptyState
            icon={<Briefcase className="h-6 w-6 text-[var(--tm-primary)]" />}
            title="No assigned projects yet"
            description="You will see your active projects here once assigned."
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {myProjects.slice(0, 6).map((p) => (
              <Card
                key={p.id}
                interactive
                animate={false}
                onClick={() => navigate(`/app/projects/${p.id}`)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl font-bold text-white shadow-soft-sm ${
                        p.company === 'piixel' ? 'bg-[var(--tm-primary)]' : 'bg-[#1b5a78]'
                      }`}
                    >
                      <Briefcase className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[15.5px] font-bold text-[var(--tm-ink)]">
                        {p.name}
                      </h3>
                      <div className="mt-0.5 flex items-center gap-2">
                        <StatusChip status={p.status} size="sm" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </StaggerItem>

      {/* Attendance History Log Table */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Attendance &amp; Shift Log</CardTitle>
            <CardDescription>Multi-session daily timestamps and records</CardDescription>
          </div>
          <Badge variant="primary">{history.length} days recorded</Badge>
        </CardHeader>

        <CardContent className="px-0 pb-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-y border-[var(--tm-border)] bg-[var(--tm-card-muted)]">
                  {[
                    'Date',
                    'Status',
                    'First in',
                    'Last out',
                    'Sessions & breaks',
                    'Worked'
                  ].map((h, i) => (
                    <th
                      key={h}
                      className={`px-6 py-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--tm-ink-muted)] ${
                        i === 5 ? 'text-right' : ''
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-12 text-center text-[13px] text-[var(--tm-ink-muted)]"
                    >
                      No attendance records yet. Punch in to start tracking.
                    </td>
                  </tr>
                ) : (
                  history.map((record) => {
                    const firstSess = record.punchSessions[0];
                    const lastSess = record.punchSessions[record.punchSessions.length - 1];
                    const breakCount = record.punchSessions.reduce(
                      (acc, s) => acc + s.breaks.length,
                      0
                    );

                    return (
                      <tr
                        key={record.id}
                        className="border-b border-[var(--tm-border)] transition-colors last:border-0 hover:bg-[var(--tm-card-muted)]"
                      >
                        <td className="px-6 py-4">
                          <span className="flex items-center gap-2 text-[13.5px] font-bold text-[var(--tm-ink)]">
                            <CalendarIcon className="h-4 w-4 text-[var(--tm-ink-muted)]" />
                            {formatDate(record.date)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <StatusChip status={record.status} size="sm" />
                        </td>
                        <td className="px-6 py-4 text-[13px] font-semibold text-[var(--tm-ink-soft)]">
                          {formatTime(firstSess?.punchIn)}
                        </td>
                        <td className="px-6 py-4 text-[13px] font-semibold text-[var(--tm-ink-soft)]">
                          {formatTime(lastSess?.punchOut)}
                        </td>
                        <td className="px-6 py-4 text-[12.5px] text-[var(--tm-ink-muted)]">
                          {record.punchSessions.length} session
                          {record.punchSessions.length === 1 ? '' : 's'}, {breakCount} break
                          {breakCount === 1 ? '' : 's'}
                        </td>
                        <td className="px-6 py-4 text-right text-[13.5px] font-extrabold tabular-nums text-[var(--tm-primary)]">
                          {formatHours(record.totalHours)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* End-of-day confirmation modal */}
      <Modal
        isOpen={isEndDayModalOpen}
        onClose={() => setIsEndDayModalOpen(false)}
        title="End my shift"
        description="Review today's totals before closing the day."
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-5 rounded-[var(--tm-radius-lg)] bg-[var(--tm-card-muted)] p-5">
            {[
              ['First punch in', formatTime(firstPunchInTime)],
              ['Last punch out', formatTime(lastPunchOutTime || nowISO)],
              ['Total hours worked', formatHours(liveWorkedHours)],
              ['Break minutes', `${liveBreakMinutes} min`]
            ].map(([label, value]) => (
              <div key={label}>
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--tm-ink-muted)]">
                  {label}
                </div>
                <div className="mt-1 text-[17px] font-extrabold tabular-nums text-[var(--tm-ink)]">
                  {value}
                </div>
              </div>
            ))}
          </div>

          <SlideToConfirm
            label="Slide to end day"
            confirmedLabel="Day ended"
            onConfirm={handleConfirmEndDay}
          />

          <div className="flex justify-center">
            <Button variant="ghost" size="sm" onClick={() => setIsEndDayModalOpen(false)}>
              Keep shift open
            </Button>
          </div>
        </div>
      </Modal>

      {/* Task Deliverable Submit Modal */}
      <TaskSubmitModal
        isOpen={!!taskToSubmit}
        onClose={() => setTaskToSubmit(null)}
        task={taskToSubmit}
        onSubmitSuccess={fetchAttendance}
      />

      {/* Daily Update Summary Modal */}
      <DailyUpdateModal
        isOpen={isDailyUpdateModalOpen}
        onClose={() => setIsDailyUpdateModalOpen(false)}
      />
    </>
  );
};
