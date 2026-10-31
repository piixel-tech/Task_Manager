import React from 'react';
import { AppShell } from './AppShell';
import { CelebrationBanners } from '../../features/gamification/components/NudgeBanner';
import { DailyStatusGate } from '../../features/status/components/DailyStatusGate';
import { TaskCompletionCelebration } from '../../features/tasks/components/TaskCompletionCelebration';

export const EmployeeLayout: React.FC = () => (
  <AppShell
    banner={<CelebrationBanners />}
    extras={
      <>
        <DailyStatusGate />
        <TaskCompletionCelebration />
      </>
    }
  />
);
