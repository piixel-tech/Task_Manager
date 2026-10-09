import React, { useEffect, useState } from 'react';
import { Sparkles, Clock, CheckCircle2 } from 'lucide-react';
import { taskService, attendanceService, projectService } from '../../../services';
import type { Task, AttendanceDay, Project } from '../../../types';
import { useAuthStore } from '../../../store/authStore';
import { Card, CardContent } from '../../../components/ui/Card';

export const MonthlyWrappedPage: React.FC = () => {
  const { user } = useAuthStore();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [attendance, setAttendance] = useState<AttendanceDay[]>([]);
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
      const [userTasks, userAtt, allProjects] = await Promise.all([
        taskService.getTasks(undefined, user.id),
        attendanceService.getAttendance(user.id),
        projectService.getProjects()
      ]);
      setTasks(userTasks);
      setAttendance(userAtt);
      setProjects(allProjects);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-xs text-[var(--tm-ink-muted)] animate-pulse">
        Unwrapping your monthly performance stats... ✨
      </div>
    );
  }

  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const totalHours = attendance.reduce((acc, a) => acc + (a.totalHours || 0), 0);
  const presentDays = attendance.filter((a) => a.status === 'present').length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-[linear-gradient(135deg,var(--tm-primary)_0%,var(--tm-primary-dark)_70%)] text-white rounded-3xl p-8 shadow-2xl relative overflow-hidden text-center border border-[var(--tm-primary)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(120,119,198,0.2),transparent)]" />
        <div className="relative z-10 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-white/75 text-xs font-semibold backdrop-blur-md">
            <Sparkles className="w-4 h-4 text-white/75" /> October 2026 Edition
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
            {user?.name}'s Monthly Wrapped 🎉
          </h1>
          <p className="text-xs text-white/75 max-w-xl mx-auto">
            A celebration of your hard work, completed tasks, and productivity milestones this month.
          </p>
        </div>
      </div>

      {/* Grid of Wrapped Cards (2 Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1: Hours & Attendance */}
        <Card className="bg-[var(--tm-primary)] text-white border-none shadow-xl">
          <CardContent className="p-6 space-y-4">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-xs font-medium text-white/75 uppercase tracking-wider">Total Productive Hours</div>
              <div className="text-3xl font-extrabold mt-1">{totalHours.toFixed(1)} hrs</div>
            </div>
            <div className="text-xs text-white/75 bg-white/10 p-2.5 rounded-xl">
              Across <strong>{presentDays}</strong> present working days this month.
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Tasks Completed */}
        <Card className="bg-[var(--tm-success)] text-white border-none shadow-xl">
          <CardContent className="p-6 space-y-4">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-xs font-medium text-white/75 uppercase tracking-wider">Deliverables Completed</div>
              <div className="text-3xl font-extrabold mt-1">{completedTasks.length} Tasks</div>
            </div>
            <div className="text-xs text-white/75 bg-white/10 p-2.5 rounded-xl">
              Across <strong>{projects.length}</strong> active team projects this month.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
