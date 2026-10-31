import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Sparkles, Clock, CheckCircle2 } from 'lucide-react';
import { taskService, projectService } from '../../../services';
import type { Task, Project } from '../../../types';
import { statusApi, type StatusEntry } from '../../../services/http/calendarApi';
import { useAuthStore } from '../../../store/authStore';
import { Card, CardContent } from '../../../components/ui/Card';
import { Skeleton, SkeletonGrid } from '../../../components/ui/Skeleton';
import { FadeIn } from '../../../components/ui/FadeIn';

export const MonthlyWrappedPage: React.FC = () => {
  const { user } = useAuthStore();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [statuses, setStatuses] = useState<StatusEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const first = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
      const last = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`;
      const [userTasks, monthStatuses, allProjects] = await Promise.all([
        taskService.getTasks(undefined, user.id),
        statusApi.range(user.id, first, last).catch(() => [] as StatusEntry[]),
        projectService.getProjects()
      ]);
      setTasks(userTasks);
      setStatuses(monthStatuses);
      setProjects(allProjects);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-40 w-full" rounded="lg" />
        <SkeletonGrid count={2} className="grid grid-cols-1 md:grid-cols-2 gap-4" />
      </div>
    );
  }

  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const workedDays = statuses.filter((x) => x.status !== 'leave').length;
  const leaveDays = statuses.filter((x) => x.status === 'leave').length;

  return (
    <FadeIn className="max-w-4xl mx-auto space-y-6">
      <PageHeader title="Monthly Wrapped" description="Your month in numbers." />

      {/* Header Banner */}
      <div className="bg-[linear-gradient(135deg,var(--tm-detail)_0%,var(--tm-detail-2)_100%)] text-[var(--tm-detail-ink)] rounded-[var(--tm-radius-lg)] p-8 shadow-soft-lg relative overflow-hidden text-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(120,119,198,0.2),transparent)]" />
        <div className="relative z-10 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--tm-on-primary)]/10 text-[var(--tm-on-primary)]/75 text-xs font-semibold backdrop-blur-md">
            <Sparkles className="w-4 h-4 text-[var(--tm-on-primary)]/75" /> October 2026 Edition
          </div>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-[var(--tm-detail-ink)]">
            {user?.name}'s Monthly Wrapped 🎉
          </h2>
          <p className="text-xs text-[var(--tm-on-primary)]/75 max-w-xl mx-auto">
            A celebration of your hard work, completed tasks, and productivity milestones this month.
          </p>
        </div>
      </div>

      {/* Grid of Wrapped Cards (2 Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1: Days worked */}
        <Card className="bg-[var(--tm-hero)] text-[var(--tm-on-primary)] border-none shadow-soft-lg">
          <CardContent className="p-6 space-y-4">
            <div className="w-10 h-10 rounded-[var(--tm-radius-md)] bg-[var(--tm-on-primary)]/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-[var(--tm-on-primary)]" />
            </div>
            <div>
              <div className="text-xs font-medium text-[var(--tm-on-primary)]/75 uppercase tracking-wider">Days Worked</div>
              <div className="text-3xl font-extrabold mt-1">{workedDays} days</div>
            </div>
            <div className="text-xs text-[var(--tm-on-primary)]/75 bg-[var(--tm-on-primary)]/10 p-2.5 rounded-[var(--tm-radius-sm)]">
              <strong>{leaveDays}</strong> day(s) on leave this month.
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Tasks Completed */}
        <Card className="bg-[var(--tm-success)] text-[var(--tm-on-primary)] border-none shadow-soft-lg">
          <CardContent className="p-6 space-y-4">
            <div className="w-10 h-10 rounded-[var(--tm-radius-md)] bg-[var(--tm-card)]/20 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-[var(--tm-on-primary)]" />
            </div>
            <div>
              <div className="text-xs font-medium text-[var(--tm-on-primary)]/75 uppercase tracking-wider">Deliverables Completed</div>
              <div className="text-3xl font-extrabold mt-1">{completedTasks.length} Tasks</div>
            </div>
            <div className="text-xs text-[var(--tm-on-primary)]/75 bg-[var(--tm-card)]/10 p-2.5 rounded-[var(--tm-radius-sm)]">
              Across <strong>{projects.length}</strong> active team projects this month.
            </div>
          </CardContent>
        </Card>
      </div>
    </FadeIn>
  );
};
