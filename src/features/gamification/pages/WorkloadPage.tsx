import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckSquare, Clock, TrendingUp, Users } from 'lucide-react';
import { taskService, userService } from '../../../services';
import type { User } from '../../../types';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { UserName } from '../../../components/ui/UserName';
import { EmptyState } from '../../../components/ui/EmptyState';
import { StatCard } from '../../../components/ui/StatCard';
import { StatusChip } from '../../../components/ui/StatusChip';
import { ProgressBar } from '../../../components/ui/ProgressRing';
import { HatchedBarChart } from '../../../components/ui/HatchedBarChart';
import type { HatchedBarDatum } from '../../../components/ui/HatchedBarChart';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StaggerItem } from '../../../components/ui/Stagger';
import { SkeletonRows } from '../../../components/ui/Skeleton';
import { FadeIn } from '../../../components/ui/FadeIn';

interface WorkloadData {
  user: User;
  openTasksCount: number;
  totalLoggedHours: number;
  isOverloaded: boolean;
}

export const WorkloadPage: React.FC = () => {
  const [workloads, setWorkloads] = useState<WorkloadData[]>([]);
  const [avgHours, setAvgHours] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWorkload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadWorkload = async () => {
    setLoading(true);
    try {
      const [allUsers, allTasks] = await Promise.all([
        userService.getUsers(),
        taskService.getTasks()
      ]);

      const employees = allUsers.filter((u) => u.role === 'employee');

      const data: WorkloadData[] = employees.map((emp) => {
        const empTasks = allTasks.filter((t) => t.assignedUserId === emp.id);
        const openTasks = empTasks.filter((t) => t.status !== 'completed');
        const loggedHours = empTasks.reduce((acc, t) => acc + (t.loggedHours || 0), 0);

        return {
          user: emp,
          openTasksCount: openTasks.length,
          totalLoggedHours: loggedHours,
          isOverloaded: false
        };
      });

      const totalTeamHours = data.reduce((acc, d) => acc + d.totalLoggedHours, 0);
      const teamAvg = data.length > 0 ? totalTeamHours / data.length : 0;
      setAvgHours(teamAvg);

      // Highlight anyone > 1.5x team average
      const threshold = Math.max(8, teamAvg * 1.5);
      data.forEach((d) => {
        if (d.totalLoggedHours > threshold || d.openTasksCount >= 4) {
          d.isOverloaded = true;
        }
      });

      setWorkloads(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const maxHours = Math.max(1, ...workloads.map((w) => w.totalLoggedHours));
  const totalOpen = workloads.reduce((acc, w) => acc + w.openTasksCount, 0);
  const overloaded = workloads.filter((w) => w.isOverloaded).length;

  /** One bar per employee; nobody with logged hours yet reads as hatched. */
  const chartData: HatchedBarDatum[] = workloads.map((w) => ({
    label: w.user.name.split(' ')[0],
    value: Math.round(w.totalLoggedHours * 10) / 10,
    hatched: w.totalLoggedHours === 0,
    note:
      w.totalLoggedHours === 0
        ? 'No hours logged yet'
        : `${w.openTasksCount} open task${w.openTasksCount === 1 ? '' : 's'}`
  }));

  return (
    <>
      <PageHeader
        title="Workload monitor"
        description="Open tasks and logged hours per employee, flagging anyone well above the team average."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Team average"
          value={Math.round(avgHours * 10) / 10}
          decimals={1}
          suffix="h"
          icon={<TrendingUp className="h-5 w-5" />}
          hint="Logged hours per person"
        />
        <StatCard
          label="Open tasks"
          value={totalOpen}
          icon={<CheckSquare className="h-5 w-5" />}
          tone="warn"
          hint="Across every employee"
        />
        <StatCard
          label="Flagged as overloaded"
          value={overloaded}
          icon={<AlertCircle className="h-5 w-5" />}
          tone={overloaded > 0 ? 'bad' : 'ok'}
          hint={`Above ${(avgHours * 1.5).toFixed(1)}h or 4+ open tasks`}
        />
      </div>

      {loading ? (
        <SkeletonRows count={5} />
      ) : workloads.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No employee data"
          description="No active employees available to display workload statistics."
        />
      ) : (
        <FadeIn>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Logged hours by employee</CardTitle>
                <p className="mt-1 text-[13px] text-[var(--tm-ink-muted)]">
                  Overload threshold is {(avgHours * 1.5).toFixed(1)}h, or four open tasks.
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <HatchedBarChart
                data={chartData}
                unit="h"
                solidLabel="Hours logged"
                hatchedLabel="Nothing logged"
              />
            </CardContent>
          </Card>

          <StaggerItem>
            <h2 className="mb-4 text-[19px] font-bold tracking-[-0.02em] text-[var(--tm-ink)]">
              Per-person breakdown
            </h2>

            <div className="space-y-3.5">
              {workloads.map((w) => {
                const barPercent = Math.min(
                  100,
                  Math.round((w.totalLoggedHours / maxHours) * 100)
                );

                return (
                  <div
                    key={w.user.id}
                    className="rounded-[var(--tm-radius-xl)] border border-[var(--tm-border)]
                      bg-[var(--tm-card)] p-5 shadow-soft-xs"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-3">
                        <UserName userId={w.user.id} size="md" showBadge={false} />
                        {w.isOverloaded && (
                          <StatusChip
                            tone="bad"
                            size="sm"
                            icon={<AlertCircle className="h-3 w-3" />}
                          >
                            High workload
                          </StatusChip>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--tm-bg-sunken)] px-3 py-1.5 text-[12px] font-semibold text-[var(--tm-ink-soft)]">
                          <CheckSquare className="h-3.5 w-3.5 text-[var(--tm-primary-dark)]" />
                          {w.openTasksCount} open
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--tm-bg-sunken)] px-3 py-1.5 text-[12px] font-semibold text-[var(--tm-ink-soft)]">
                          <Clock className="h-3.5 w-3.5 text-[var(--tm-warning)]" />
                          {w.totalLoggedHours.toFixed(1)}h
                        </span>
                      </div>
                    </div>

                    <div className="mt-4">
                      <ProgressBar
                        value={barPercent}
                        tone={w.isOverloaded ? 'bad' : 'primary'}
                        height={10}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </StaggerItem>
        </FadeIn>
      )}
    </>
  );
};
