import React, { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { BottomTabBar } from './BottomTabBar';
import { RouteTransition } from './RouteTransition';
import { DayStartModal } from '../ui/DayStartModal';
import { IdleActivityMonitor } from '../ui/IdleActivityMonitor';
import { MidnightAutoCloseNotice } from '../ui/MidnightAutoCloseNotice';
import { NudgeBanner, CelebrationBanners } from '../../features/gamification/components/NudgeBanner';
import { BreakScreen } from '../../features/attendance/components/BreakScreen';
import { TaskCompletionCelebration } from '../../features/tasks/components/TaskCompletionCelebration';
import { attendanceService } from '../../services';
import { useAuthStore } from '../../store/authStore';
import { getTodayDateString } from '../../utils/time';
import type { AttendanceDay } from '../../types';

export const EmployeeLayout: React.FC = () => {
  const { user } = useAuthStore();
  const [todayAtt, setTodayAtt] = useState<AttendanceDay | null>(null);

  useEffect(() => {
    if (user) {
      attendanceService.getAttendance(user.id, getTodayDateString()).then((records) => {
        setTodayAtt(records[0] || null);
      });
    }
  }, [user]);

  const activePunch = todayAtt?.punchSessions.find((s) => !s.punchOut);
  const hasMarked = !!todayAtt && (todayAtt.status === 'present' || todayAtt.status === 'on_leave');

  return (
    <div className="flex min-h-screen bg-[var(--tm-bg)] pb-16 lg:pb-0">
      <DayStartModal />
      <IdleActivityMonitor />
      <MidnightAutoCloseNotice />
      <BreakScreen />
      <TaskCompletionCelebration />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col lg:pl-[268px]">
        <Topbar />
        <NudgeBanner isPunchedIn={!!activePunch} hasMarkedAttendanceToday={hasMarked} />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <CelebrationBanners />
          <RouteTransition className="space-y-6 lg:space-y-7" />
        </main>
      </div>
      <BottomTabBar />
    </div>
  );
};
