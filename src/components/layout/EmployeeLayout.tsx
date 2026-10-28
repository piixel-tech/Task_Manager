import React from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { BottomTabBar } from './BottomTabBar';
import { RouteTransition } from './RouteTransition';
import { CelebrationBanners } from '../../features/gamification/components/NudgeBanner';
import { DailyStatusGate } from '../../features/status/components/DailyStatusGate';
import { TaskCompletionCelebration } from '../../features/tasks/components/TaskCompletionCelebration';

export const EmployeeLayout: React.FC = () => {
  return (
    <div className="flex min-h-screen bg-[var(--tm-bg)] pb-16 lg:pb-0">
      <DailyStatusGate />
      <TaskCompletionCelebration />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col lg:pl-[268px]">
        <Topbar />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <CelebrationBanners />
          <RouteTransition className="space-y-6 lg:space-y-7" />
        </main>
      </div>
      <BottomTabBar />
    </div>
  );
};
